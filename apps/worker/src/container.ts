import type { AppConfig } from '@sentra/config';
import {
  createBullmqQueueProvider,
  createPrismaInboxRepository,
  createPrismaOperationalEventWriter,
  createPrismaOutboxRepository,
  createPrismaUnitOfWork,
  createRedisCacheProvider,
  createSystemClock,
  createUlidIdGenerator,
  type BullmqQueueProvider,
  type RedisCacheProvider,
} from '@sentra/adapters';
import { createPrismaClient, type PrismaClient } from '@sentra/db';
import type { Logger } from '@sentra/observability';
import type { Clock, IdGenerator } from '@sentra/ports';
import {
  createRecommendationIssuedConsumer,
  type RecommendationIssuedConsumer,
} from './consumers/recommendation-consumer';
import { createOutboxPublisher, type OutboxPublisher } from './publisher/outbox-publisher';

/**
 * The worker composition root. Wires the durable-delivery adapters: Redis (cache),
 * BullMQ (transport), and the Prisma repositories the idempotent consumer needs. The worker
 * runs in `real` provider mode only — durable delivery has no meaning against the in-memory
 * demonstration store.
 */
export interface WorkerContainer {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly prisma: PrismaClient;
  readonly cache: RedisCacheProvider;
  readonly queue: BullmqQueueProvider;
  readonly consumer: RecommendationIssuedConsumer;
  readonly publisher: OutboxPublisher;
  readonly startedAtMs: number;
  readonly disconnect: () => Promise<void>;
}

export const buildWorkerContainer = (config: AppConfig, logger: Logger): WorkerContainer => {
  if (config.runtime.providerMode !== 'real') {
    throw new Error(
      'The worker requires SENTRA_PROVIDER_MODE=real. Durable delivery has no meaning against the in-memory store.',
    );
  }

  const clock = createSystemClock();
  const ids = createUlidIdGenerator();
  const prisma = createPrismaClient({ config });
  const unitOfWork = createPrismaUnitOfWork(prisma, config.database.transactionTimeoutMs);
  const inbox = createPrismaInboxRepository(prisma, unitOfWork);
  const outbox = createPrismaOutboxRepository(prisma, unitOfWork);
  const operationalEvents = createPrismaOperationalEventWriter(unitOfWork);
  const cache = createRedisCacheProvider(config);
  const queue = createBullmqQueueProvider(config);

  const consumer = createRecommendationIssuedConsumer({
    unitOfWork,
    inbox,
    operationalEvents,
    clock,
    ids,
    logger,
  });

  const publisher = createOutboxPublisher({
    outbox,
    queue,
    clock,
    ids,
    logger,
    pollIntervalMs: config.worker.outboxPollIntervalMs,
    batchSize: config.worker.outboxBatchSize,
    claimTimeoutMs: config.worker.outboxClaimTimeoutMs,
    retryInitialDelayMs: config.queue.retry.initialDelayMs,
  });

  return {
    config,
    logger,
    clock,
    ids,
    prisma,
    cache,
    queue,
    consumer,
    publisher,
    startedAtMs: Date.now(),
    disconnect: async () => {
      await queue.close();
      await cache.close();
      await prisma.$disconnect();
    },
  };
};
