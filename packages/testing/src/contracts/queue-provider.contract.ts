import { describe, expect, it } from 'vitest';
import type { QueueProvider } from '@sentra/ports';

export interface QueueProviderContractHarness {
  readonly queue: QueueProvider;
  readonly now: () => Date;
  readonly advanceTime: (ms: number) => void;
  readonly flush: (queueName: string) => Promise<void>;
  readonly configureFailure: (messageId: string, failUntilAttempt: number) => void;
  readonly forceDuplicateDelivery: (messageId: string) => void;
}

export const describeQueueProviderContract = (
  name: string,
  factory: () => QueueProviderContractHarness,
): void => {
  describe(`${name} QueueProvider`, () => {
    it('delivers an enqueued message to a registered consumer', async () => {
      const harness = factory();
      const queueName = 'sentra.domain-events';
      const received: string[] = [];

      await harness.queue.consume(queueName, async (message) => {
        received.push(String(message.payload));
      });

      const { id } = await harness.queue.enqueue(queueName, 'domain-event.publish', 'payload-a');
      await harness.flush(queueName);

      expect(received).toContain('payload-a');
      expect(id).toBeTruthy();
    });

    it('honours a deduplication identifier without creating a second transport record', async () => {
      const harness = factory();
      const queueName = 'sentra.domain-events';

      const first = await harness.queue.enqueue(queueName, 'domain-event.publish', 'first', {
        deduplicationId: 'dedupe-1',
      });
      const second = await harness.queue.enqueue(queueName, 'domain-event.publish', 'second', {
        deduplicationId: 'dedupe-1',
      });

      expect(second.id).toBe(first.id);
    });

    it('hides delayed messages until the delay elapses and shows them exactly at availableAt', async () => {
      const harness = factory();
      const queueName = 'sentra.domain-events';
      const received: string[] = [];

      await harness.queue.consume(queueName, async (message) => {
        received.push(String(message.payload));
      });

      const availableAt = new Date(harness.now().getTime() + 1_000);
      await harness.queue.enqueue(queueName, 'domain-event.publish', 'delayed', { delayMs: 1_000 });

      await harness.flush(queueName);
      expect(received).toHaveLength(0);

      harness.advanceTime(999);
      await harness.flush(queueName);
      expect(received).toHaveLength(0);

      harness.advanceTime(1);
      expect(harness.now().getTime()).toBeGreaterThanOrEqual(availableAt.getTime());
      await harness.flush(queueName);
      expect(received).toEqual(['delayed']);
    });

    it('delivers the same logical message more than once under at-least-once semantics', async () => {
      const harness = factory();
      const queueName = 'sentra.domain-events';
      const deliveries: Array<{ payload: string; attempt: number }> = [];

      await harness.queue.consume(queueName, async (message) => {
        deliveries.push({ payload: String(message.payload), attempt: message.attempt });
      });

      const { id } = await harness.queue.enqueue(queueName, 'domain-event.publish', 'dup');
      harness.forceDuplicateDelivery(id);
      await harness.flush(queueName);

      expect(deliveries.filter((entry) => entry.payload === 'dup').length).toBeGreaterThanOrEqual(2);
      expect(new Set(deliveries.map((entry) => entry.attempt)).size).toBe(1);
    });

    it('increments attempt numbers across retries until success', async () => {
      const harness = factory();
      const queueName = 'sentra.domain-events';
      const attempts: number[] = [];

      await harness.queue.consume(queueName, async (message) => {
        attempts.push(message.attempt);
      });

      const { id } = await harness.queue.enqueue(
        queueName,
        'domain-event.publish',
        'retry-me',
        { maxAttempts: 3 },
      );
      harness.configureFailure(id, 1);
      await harness.flush(queueName);

      expect(attempts).toEqual([2]);
    });

    it('registers a repeating schedule without throwing', async () => {
      const harness = factory();
      await expect(
        harness.queue.schedule('sentra.retention', 'retention.sweep', '0 3 * * *', {
          schemaVersion: 1,
          correlationId: 'crl_schedule',
        }),
      ).resolves.toBeUndefined();
    });
  });
};
