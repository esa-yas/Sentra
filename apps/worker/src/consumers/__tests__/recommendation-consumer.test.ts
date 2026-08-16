import { describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator, createFakeUnitOfWork } from '@sentra/testing';
import { createNullLogger } from '@sentra/observability';
import type {
  InboxRepository,
  OperationalEventWriter,
  QueueMessage,
  RecordOperationalEventInput,
  TransactionScope,
} from '@sentra/ports';
import type { FakeUnitOfWork } from '@sentra/testing';
import { createRecommendationIssuedConsumer } from '../recommendation-consumer';

const ids = createFakeIdGenerator();

const validJob = (overrides: Record<string, unknown> = {}) => ({
  eventId: ids.generate(),
  eventType: 'recommendation.issued',
  schemaVersion: 1,
  organizationId: null,
  aggregateType: 'recommendation',
  aggregateId: ids.generate(),
  correlationId: 'crl_slice3_worker_1',
  occurredAt: '2026-08-11T12:00:00.000Z',
  payload: { recommendedAction: 'WARN', riskLevel: 'MEDIUM', riskScore: 42 },
  ...overrides,
});

const message = (payload: unknown, attempt = 1): QueueMessage => ({
  id: 'job_1',
  name: 'recommendation.issued.publish',
  payload,
  attempt,
  enqueuedAt: new Date('2026-08-11T12:00:00.000Z'),
});

/** Inbox fake that shares the transaction's fate through the coordinator. */
class FakeInbox implements InboxRepository {
  public readonly committed = new Set<string>();

  public constructor(private readonly uow: FakeUnitOfWork) {}

  public async tryRecord(
    input: { externalId: string },
    scope?: TransactionScope,
  ): Promise<boolean> {
    if (this.committed.has(input.externalId)) {
      return false;
    }
    this.committed.add(input.externalId);
    if (scope !== undefined) {
      this.uow.coordinator.stage(scope.scopeId, {
        commit: () => undefined,
        rollback: () => {
          this.committed.delete(input.externalId);
        },
      });
    }
    return true;
  }

  public async find(): Promise<null> {
    return null;
  }

  public async deleteExpired(): Promise<number> {
    return 0;
  }
}

class FakeOpWriter implements OperationalEventWriter {
  public readonly records: RecordOperationalEventInput[] = [];
  public failNext = false;

  public async record(input: RecordOperationalEventInput): Promise<void> {
    if (this.failNext) {
      throw new Error('database unavailable');
    }
    this.records.push(input);
  }
}

const build = () => {
  const clock = createFakeClock();
  const unitOfWork = createFakeUnitOfWork(clock);
  const inbox = new FakeInbox(unitOfWork);
  const operationalEvents = new FakeOpWriter();
  const consumer = createRecommendationIssuedConsumer({
    unitOfWork,
    inbox,
    operationalEvents,
    clock,
    ids: createFakeIdGenerator(),
    logger: createNullLogger(),
  });
  return { consumer, inbox, operationalEvents };
};

describe('RecommendationIssuedConsumer', () => {
  it('performs the side effect on first delivery', async () => {
    const { consumer, operationalEvents } = build();
    const outcome = await consumer.process(message(validJob()));

    expect(outcome).toBe('processed');
    expect(operationalEvents.records).toHaveLength(1);
  });

  it('does not repeat the side effect on a duplicate delivery', async () => {
    const { consumer, operationalEvents } = build();
    const job = validJob();

    const first = await consumer.process(message(job));
    const second = await consumer.process(message(job, 2));

    expect(first).toBe('processed');
    expect(second).toBe('duplicate');
    expect(operationalEvents.records).toHaveLength(1);
  });

  it('collapses two racing deliveries of the same event to one side effect', async () => {
    const { consumer, operationalEvents } = build();
    const job = validJob();
    // The fake unit of work serialises transactions, so this models the DB unique-constraint
    // race: the second delivery finds the inbox row already present.
    const outcomes = [
      await consumer.process(message(job)),
      await consumer.process(message(job, 2)),
    ];

    expect(outcomes.filter((o) => o === 'processed')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(1);
    expect(operationalEvents.records).toHaveLength(1);
  });

  it('rolls back and stays retryable when the side effect fails', async () => {
    const { consumer, inbox, operationalEvents } = build();
    const job = validJob();
    operationalEvents.failNext = true;

    await expect(consumer.process(message(job))).rejects.toThrow('database unavailable');
    // The inbox registration was rolled back, so a retry can process the event.
    expect(inbox.committed.has(job.eventId as string)).toBe(false);

    operationalEvents.failNext = false;
    const retry = await consumer.process(message(job, 2));
    expect(retry).toBe('processed');
    expect(operationalEvents.records).toHaveLength(1);
  });

  it('rejects an unsupported schema version without a side effect', async () => {
    const { consumer, operationalEvents } = build();
    const outcome = await consumer.process(message(validJob({ schemaVersion: 2 })));

    expect(outcome).toBe('rejected');
    expect(operationalEvents.records).toHaveLength(0);
  });

  it('rejects a poison payload without a side effect', async () => {
    const { consumer, operationalEvents } = build();
    const outcome = await consumer.process(message({ not: 'a valid job' }));

    expect(outcome).toBe('rejected');
    expect(operationalEvents.records).toHaveLength(0);
  });

  it('propagates the correlation id onto the recorded delivery event', async () => {
    const { consumer, operationalEvents } = build();
    await consumer.process(message(validJob({ correlationId: 'crl_trace_propagate' })));

    expect(operationalEvents.records[0]?.correlationId).toBe('crl_trace_propagate');
  });
});
