import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBullmqQueueProvider, type BullmqQueueProvider } from '@sentra/adapters';
import { JOB_NAMES, QUEUE_NAMES } from '@sentra/contracts';
import type { QueueMessage } from '@sentra/ports';
import { buildQueueTestConfig, flushTestRedis, sleep, waitFor } from './queue-helpers';

/**
 * The real BullMQ QueueProvider adapter against a disposable local Redis.
 *
 * Where the in-memory fake exposes test-only controls (`configureFailure`, `flush`,
 * `advanceTime`), those cannot map to a real broker. The business guarantees they protect —
 * delivery, delayed visibility, retry/backoff progression, stable-id de-duplication, and a
 * closed queue-name catalog — are proven directly here instead.
 */
const QUEUE = QUEUE_NAMES.RECOMMENDATION_EVENTS;
const JOB = JOB_NAMES.PUBLISH_RECOMMENDATION;

describe('BullmqQueueProvider (real BullMQ)', () => {
  const config = buildQueueTestConfig();
  let queue: BullmqQueueProvider;

  beforeEach(async () => {
    await flushTestRedis();
    queue = createBullmqQueueProvider(config);
  });

  afterEach(async () => {
    await queue.close();
  });

  it('delivers an enqueued job to a consumer', async () => {
    const received: QueueMessage[] = [];
    const handle = await queue.consume(QUEUE, async (message) => {
      received.push(message);
    });

    const eventId = randomUUID();
    const result = await queue.enqueue(QUEUE, JOB, { eventId });
    expect(result.id).toBeTruthy();

    await waitFor(() => received.length > 0);
    expect((received[0]!.payload as { eventId: string }).eventId).toBe(eventId);
    await handle.stop();
  });

  it('honours delayed visibility', async () => {
    const received: number[] = [];
    const enqueuedAt = Date.now();
    const handle = await queue.consume(QUEUE, async () => {
      received.push(Date.now() - enqueuedAt);
    });

    await queue.enqueue(QUEUE, JOB, { eventId: randomUUID() }, { delayMs: 700 });

    // Not delivered early.
    await sleep(300);
    expect(received).toHaveLength(0);

    await waitFor(() => received.length > 0, { timeoutMs: 4_000 });
    expect(received[0]!).toBeGreaterThanOrEqual(600);
    await handle.stop();
  });

  it('progresses through retry attempts with backoff until success', async () => {
    const attempts: number[] = [];
    const handle = await queue.consume(QUEUE, async (message) => {
      attempts.push(message.attempt);
      if (message.attempt < 2) {
        throw new Error('transient failure to force a retry');
      }
    });

    await queue.enqueue(QUEUE, JOB, { eventId: randomUUID() }, { maxAttempts: 3 });

    await waitFor(() => attempts.length >= 2, { timeoutMs: 6_000 });
    expect(attempts.slice(0, 2)).toEqual([1, 2]);
    await handle.stop();
  });

  it('de-duplicates by stable logical id (idempotent republish)', async () => {
    const eventId = randomUUID();
    // Two enqueues with the same stable id before any consumer runs.
    const first = await queue.enqueue(QUEUE, JOB, { eventId }, { deduplicationId: eventId });
    const second = await queue.enqueue(QUEUE, JOB, { eventId }, { deduplicationId: eventId });
    expect(second.id).toBe(first.id);

    let deliveries = 0;
    const handle = await queue.consume(QUEUE, async () => {
      deliveries += 1;
    });

    await waitFor(() => deliveries > 0);
    // Give any spurious second delivery a chance to arrive, then assert exactly one.
    await sleep(500);
    expect(deliveries).toBe(1);
    await handle.stop();
  });

  it('refuses a queue name outside the fixed catalog', async () => {
    await expect(queue.enqueue('arbitrary-queue', JOB, { eventId: randomUUID() })).rejects.toThrow(
      /Unknown queue/,
    );
  });

  it('reports queue health and a live worker count', async () => {
    const handle = await queue.consume(QUEUE, async () => {});
    await queue.enqueue(QUEUE, JOB, { eventId: randomUUID() });

    const health = await queue.getQueueHealth(QUEUE);
    expect(health.reachable).toBe(true);
    expect(health.paused).toBe(false);

    const workers = await waitFor(async () => {
      const count = await queue.countWorkers(QUEUE);
      return count > 0 ? count : 0;
    });
    expect(workers).toBeGreaterThan(0);
    await handle.stop();
  });

  it('shuts down producer and worker connections cleanly', async () => {
    const handle = await queue.consume(QUEUE, async () => {});
    await queue.enqueue(QUEUE, JOB, { eventId: randomUUID() });
    await expect(handle.stop()).resolves.toBeUndefined();
    // close() is also invoked in afterEach; calling it here proves it is safe and idempotent.
    await expect(queue.close()).resolves.toBeUndefined();
  });
});
