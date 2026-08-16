import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createBullmqQueueProvider,
  createPrismaInboxRepository,
  createPrismaOperationalEventWriter,
  createPrismaOutboxRepository,
  createPrismaUnitOfWork,
  createSystemClock,
  createUlidIdGenerator,
  type BullmqQueueProvider,
} from '@sentra/adapters';
import { JOB_NAMES, QUEUE_NAMES, RECOMMENDATION_ISSUED_EVENT_TYPE } from '@sentra/contracts';
import { createNullLogger } from '@sentra/observability';
import type { QueueConsumerHandle } from '@sentra/ports';
import { createRecommendationIssuedConsumer } from '../../apps/worker/src/consumers/recommendation-consumer';
import { createOutboxPublisher } from '../../apps/worker/src/publisher/outbox-publisher';
import { correlationId, prisma } from './setup';
import { buildQueueTestConfig, flushTestRedis, sleep, waitFor } from './queue-helpers';

/**
 * End-to-end proof of the Slice 3 completion criterion: a committed PENDING outbox row is
 * claimed, published to BullMQ, processed by the idempotent worker, and recorded as a durable
 * delivery — and a duplicate delivery produces no second side effect.
 *
 * The outbox (PostgreSQL) and inbox (PostgreSQL) are the authoritative records; Redis/BullMQ
 * carry only transport state.
 */
const QUEUE = QUEUE_NAMES.RECOMMENDATION_EVENTS;
const JOB = JOB_NAMES.PUBLISH_RECOMMENDATION;

describe('durable delivery (outbox → BullMQ → idempotent worker)', () => {
  const config = buildQueueTestConfig();
  const clock = createSystemClock();
  const ids = createUlidIdGenerator();
  const logger = createNullLogger();

  let queue: BullmqQueueProvider;
  let consumerHandle: QueueConsumerHandle;

  const unitOfWork = createPrismaUnitOfWork(prisma, 15_000);
  const outbox = createPrismaOutboxRepository(prisma, unitOfWork);
  const inbox = createPrismaInboxRepository(prisma, unitOfWork);
  const operationalEvents = createPrismaOperationalEventWriter(unitOfWork);

  const consumer = createRecommendationIssuedConsumer({
    unitOfWork,
    inbox,
    operationalEvents,
    clock,
    ids,
    logger,
  });

  beforeAll(async () => {
    await flushTestRedis();
    queue = createBullmqQueueProvider(config);
    consumerHandle = await queue.consume(QUEUE, consumer.handle);
  });

  afterAll(async () => {
    await consumerHandle.stop();
    await queue.close();
  });

  beforeEach(async () => {
    // setup.ts already truncates the database before each test; also clear the transport so a
    // previous test's jobs cannot bleed in.
    await flushTestRedis();
  });

  const seedPendingOutbox = async (cid: string): Promise<string> => {
    const eventId = ids.generate();
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        organizationId: null,
        aggregateType: 'recommendation',
        aggregateId: ids.generate(),
        eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
        schemaVersion: 1,
        payload: { recommendedAction: 'WARN', riskLevel: 'MEDIUM', riskScore: 42 },
        correlationId: cid,
        maxAttempts: 8,
      },
    });
    return eventId;
  };

  const buildPublisher = () =>
    createOutboxPublisher({
      outbox,
      queue,
      clock,
      ids,
      logger,
      pollIntervalMs: 500,
      batchSize: 10,
      claimTimeoutMs: 30_000,
      retryInitialDelayMs: 50,
    });

  it('claims, publishes, and delivers a pending event exactly once, tolerating a duplicate', async () => {
    const cid = correlationId();
    const eventId = await seedPendingOutbox(cid);

    // Publisher claims the committed row and publishes it.
    const published = await buildPublisher().runOnce();
    expect(published).toBe(1);

    // The outbox row is marked published only after BullMQ accepted the job.
    const row = await waitFor(async () => {
      const current = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
      return current?.status === 'PUBLISHED' ? current : null;
    });
    expect(row.publishedAt).not.toBeNull();

    // The worker records exactly one durable delivery event.
    await waitFor(async () => (await prisma.operationalEvent.count({ where: { correlationId: cid } })) >= 1);
    expect(await prisma.operationalEvent.count({ where: { correlationId: cid } })).toBe(1);
    expect(await prisma.inboxEvent.count({ where: { externalId: eventId } })).toBe(1);

    // Controlled duplicate: re-deliver the same logical event on a fresh transport id. BullMQ
    // delivers it, but the inbox makes it a no-op, so no second side effect is produced.
    await queue.enqueue(QUEUE, JOB, {
      eventId,
      eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
      schemaVersion: 1,
      organizationId: null,
      aggregateType: 'recommendation',
      aggregateId: row.aggregateId,
      correlationId: cid,
      occurredAt: row.createdAt.toISOString(),
      payload: { recommendedAction: 'WARN', riskLevel: 'MEDIUM', riskScore: 42 },
    });

    // Give the duplicate time to be consumed, then confirm still exactly one side effect.
    await sleep(1_000);
    expect(await prisma.operationalEvent.count({ where: { correlationId: cid } })).toBe(1);
    expect(await prisma.inboxEvent.count({ where: { externalId: eventId } })).toBe(1);
  });

  it('produces no queue job for a rolled-back transaction', async () => {
    const cid = correlationId();
    await expect(
      unitOfWork.run(async (scope) => {
        await outbox.enqueue(
          {
            id: ids.generate(),
            organizationId: null,
            aggregateType: 'recommendation',
            aggregateId: ids.generate(),
            eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
            schemaVersion: 1,
            payload: { recommendedAction: 'ALLOW' },
            correlationId: cid,
            maxAttempts: 8,
            availableAt: clock.now(),
            expiresAt: null,
          },
          scope,
        );
        throw new Error('domain write failed after staging the outbox row');
      }),
    ).rejects.toThrow();

    // Nothing committed, so nothing to claim and nothing to publish.
    expect(await prisma.outboxEvent.count({ where: { correlationId: cid } })).toBe(0);
    expect(await buildPublisher().runOnce()).toBe(0);
  });
});
