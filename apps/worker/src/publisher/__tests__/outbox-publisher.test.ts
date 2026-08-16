import { describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator, createFakeQueueProvider } from '@sentra/testing';
import { createNullLogger } from '@sentra/observability';
import type {
  EnqueueOutboxEventInput,
  OutboxEventRecord,
  OutboxRepository,
  QueueProvider,
  TransactionScope,
} from '@sentra/ports';
import { createOutboxPublisher } from '../outbox-publisher';

const ids = createFakeIdGenerator();

const makeRecord = (overrides: Partial<OutboxEventRecord> = {}): OutboxEventRecord => ({
  id: ids.generate(),
  organizationId: null,
  aggregateType: 'recommendation',
  aggregateId: ids.generate(),
  eventType: 'recommendation.issued',
  schemaVersion: 1,
  payload: { correlationId: 'crl_slice3_0001', recommendedAction: 'WARN', riskLevel: 'MEDIUM', riskScore: 42 },
  correlationId: 'crl_slice3_0001',
  status: 'PENDING',
  attempts: 0,
  maxAttempts: 8,
  availableAt: new Date('2026-08-11T12:00:00.000Z'),
  claimedAt: null,
  claimToken: null,
  publishedAt: null,
  lastError: null,
  createdAt: new Date('2026-08-11T12:00:00.000Z'),
  ...overrides,
});

/** Minimal in-memory outbox honouring claim/reclaim, mark-published, mark-failed, dead-letter. */
class FakeOutbox implements OutboxRepository {
  public readonly rows = new Map<string, OutboxEventRecord>();

  public seed(record: OutboxEventRecord): void {
    this.rows.set(record.id, record);
  }

  public async enqueue(input: EnqueueOutboxEventInput, _scope: TransactionScope): Promise<OutboxEventRecord> {
    const record = makeRecord({ ...input });
    this.rows.set(record.id, record);
    return record;
  }

  public async claimBatch(input: {
    limit: number;
    claimToken: string;
    now: Date;
    reclaimBefore: Date;
  }): Promise<readonly OutboxEventRecord[]> {
    const claimable = [...this.rows.values()].filter(
      (row) =>
        (row.status === 'PENDING' && row.availableAt.getTime() <= input.now.getTime()) ||
        (row.status === 'PUBLISHING' && row.claimedAt !== null && row.claimedAt.getTime() < input.reclaimBefore.getTime()),
    );
    const claimed = claimable.slice(0, input.limit).map((row) => {
      const next: OutboxEventRecord = { ...row, status: 'PUBLISHING', claimedAt: input.now, claimToken: input.claimToken };
      this.rows.set(row.id, next);
      return next;
    });
    return claimed;
  }

  public async markPublished(id: string, publishedAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row !== undefined) {
      this.rows.set(id, { ...row, status: 'PUBLISHED', publishedAt, claimToken: null });
    }
  }

  public async markFailed(input: { id: string; error: string; availableAt: Date }): Promise<OutboxEventRecord> {
    const row = this.rows.get(input.id)!;
    const next: OutboxEventRecord = {
      ...row,
      status: 'FAILED',
      lastError: input.error,
      availableAt: input.availableAt,
      attempts: row.attempts + 1,
      claimToken: null,
      claimedAt: null,
    };
    this.rows.set(input.id, next);
    return next;
  }

  public async markDeadLettered(id: string, error: string): Promise<OutboxEventRecord> {
    const row = this.rows.get(id)!;
    const next: OutboxEventRecord = { ...row, status: 'DEAD_LETTER', lastError: error, claimToken: null };
    this.rows.set(id, next);
    return next;
  }

  public async countByStatus(): Promise<Readonly<Record<string, number>>> {
    return {};
  }

  public async deletePublishedBefore(): Promise<number> {
    return 0;
  }
}

const buildPublisher = (outbox: OutboxRepository, queue: QueueProvider) => {
  const clock = createFakeClock();
  return {
    clock,
    publisher: createOutboxPublisher({
      outbox,
      queue,
      clock,
      ids: createFakeIdGenerator(),
      logger: createNullLogger(),
      pollIntervalMs: 50,
      batchSize: 10,
      claimTimeoutMs: 60_000,
      retryInitialDelayMs: 1_000,
    }),
  };
};

describe('OutboxPublisher', () => {
  it('publishes a pending event to the queue and marks it published', async () => {
    const outbox = new FakeOutbox();
    const record = makeRecord();
    outbox.seed(record);
    const queue = createFakeQueueProvider();
    const { publisher } = buildPublisher(outbox, queue);

    const published = await publisher.runOnce();

    expect(published).toBe(1);
    expect(queue.messages()).toHaveLength(1);
    expect(queue.messages()[0]?.id).toBe(record.id);
    expect(outbox.rows.get(record.id)?.status).toBe('PUBLISHED');
  });

  it('produces no job when the outbox is empty (a rolled-back transaction leaves no row)', async () => {
    const outbox = new FakeOutbox();
    const queue = createFakeQueueProvider();
    const { publisher } = buildPublisher(outbox, queue);

    const published = await publisher.runOnce();

    expect(published).toBe(0);
    expect(queue.messages()).toHaveLength(0);
  });

  it('claims exclusively: a concurrent claimer sees nothing once a row is PUBLISHING', async () => {
    const outbox = new FakeOutbox();
    outbox.seed(makeRecord());

    const first = await outbox.claimBatch({
      limit: 10,
      claimToken: 'a',
      now: new Date('2026-08-11T12:00:00.000Z'),
      reclaimBefore: new Date('2026-08-11T11:59:00.000Z'),
    });
    const second = await outbox.claimBatch({
      limit: 10,
      claimToken: 'b',
      now: new Date('2026-08-11T12:00:00.000Z'),
      reclaimBefore: new Date('2026-08-11T11:59:00.000Z'),
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('reclaims a claim abandoned by a crashed publisher after the lease expires', async () => {
    const outbox = new FakeOutbox();
    // A row stuck in PUBLISHING, claimed well before the reclaim window.
    outbox.seed(
      makeRecord({
        status: 'PUBLISHING',
        claimedAt: new Date('2026-08-11T11:00:00.000Z'),
        claimToken: 'dead-worker',
      }),
    );
    const queue = createFakeQueueProvider();
    const { publisher } = buildPublisher(outbox, queue);

    const published = await publisher.runOnce();

    expect(published).toBe(1);
    expect(queue.messages()).toHaveLength(1);
  });

  it('leaves the event retryable when the queue is unavailable', async () => {
    const outbox = new FakeOutbox();
    const record = makeRecord();
    outbox.seed(record);
    const failingQueue: QueueProvider = {
      enqueue: async () => {
        throw new Error('ECONNREFUSED redis');
      },
      schedule: async () => undefined,
      consume: async () => ({ stop: async () => undefined }),
      close: async () => undefined,
    };
    const { publisher } = buildPublisher(outbox, failingQueue);

    const published = await publisher.runOnce();

    expect(published).toBe(0);
    const row = outbox.rows.get(record.id);
    expect(row?.status).toBe('FAILED');
    expect(row?.attempts).toBe(1);
    // Rescheduled into the future for a later retry, not lost.
    expect(row?.availableAt.getTime()).toBeGreaterThan(record.availableAt.getTime());
  });

  it('republishing after a publish/DB-crash does not create a second transport record', async () => {
    const outbox = new FakeOutbox();
    const record = makeRecord();
    outbox.seed(record);
    const queue = createFakeQueueProvider();
    const { publisher } = buildPublisher(outbox, queue);

    // First publish succeeds and marks published.
    await publisher.runOnce();
    expect(queue.messages()).toHaveLength(1);

    // Simulate a crash between transport-accept and DB-record: the row is still PUBLISHING and
    // gets reclaimed. The stable job id (event id) makes the re-enqueue idempotent.
    outbox.seed({ ...record, status: 'PUBLISHING', claimedAt: new Date('2026-08-11T11:00:00.000Z') });
    await publisher.runOnce();

    expect(queue.messages()).toHaveLength(1);
  });

  it('dead-letters a poison event with an unroutable type rather than retrying forever', async () => {
    const outbox = new FakeOutbox();
    const record = makeRecord({ eventType: 'unknown.event.v1' });
    outbox.seed(record);
    const queue = createFakeQueueProvider();
    const { publisher } = buildPublisher(outbox, queue);

    const published = await publisher.runOnce();

    expect(published).toBe(0);
    expect(outbox.rows.get(record.id)?.status).toBe('DEAD_LETTER');
    expect(queue.messages()).toHaveLength(0);
  });
});
