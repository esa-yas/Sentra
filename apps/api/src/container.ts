import type { AppConfig } from '@sentra/config';
import {
  createArgon2PasswordHasher,
  createBullmqQueueProvider,
  createInMemoryAuditProvider,
  createInMemoryOperationsStore,
  createInMemoryUnitOfWork,
  createJwsSignatureVerifier,
  createNodeSecureRandom,
  createPostgresOperationsStore,
  createPostgresQueueStore,
  createPrismaAuditProvider,
  createPrismaDecisionPersistence,
  createPrismaIdempotencyRepository,
  createPrismaOutboxRepository,
  createPrismaPartnerApiActivityStore,
  createPrismaPartnerConnectionRepository,
  createPrismaPartnerDirectory,
  createPrismaPartnerDomainStore,
  createPrismaPartnerSigningKeyRepository,
  createPrismaUnitOfWork,
  createRedisCacheProvider,
  createSystemClock,
  createUlidIdGenerator,
} from '@sentra/adapters';
import { createPrismaClient } from '@sentra/db';
import {
  SYNTHETIC_BANK_SLUG,
  SYNTHETIC_DEMO_SUBJECT_REF,
  SYNTHETIC_TELECOM_SLUG,
  createEvaluatePaymentRiskUseCase,
  type EvaluatePaymentRiskUseCase,
} from '@sentra/core';
import type { Logger } from '@sentra/observability';
import type { Clock, IdGenerator, OperationsReadModel } from '@sentra/ports';
import { createQueueAdmin, type QueueAdmin } from './queue-admin';
import { createPartnerAdmin, type PartnerAdmin } from './partner/admin';
import { createPartnerAuthenticator, type PartnerAuthenticator } from './partner/authenticator';
import { createPartnerIdempotency, type PartnerIdempotency } from './partner/idempotency';
import { createPartnerIngest, type PartnerIngest } from './partner/ingest';
import { createPartnerSandbox, type PartnerSandbox } from './partner/sandbox';
import type {
  PartnerApiActivityStore,
  PartnerConnectionRepository,
  PartnerDirectoryReadModel,
  PartnerSigningKeyRepository,
} from '@sentra/ports';

/**
 * The composition root. The only place allowed to know which concrete adapters are wired.
 */
export type ProviderMode = 'in-memory' | 'real';

export interface PartnerRuntime {
  readonly authenticator: PartnerAuthenticator;
  readonly idempotency: PartnerIdempotency;
  readonly admin: PartnerAdmin;
  readonly ingest: PartnerIngest;
  readonly sandbox: PartnerSandbox;
  readonly activity: PartnerApiActivityStore;
  readonly directory: PartnerDirectoryReadModel;
  readonly connections: PartnerConnectionRepository;
  readonly keys: PartnerSigningKeyRepository;
  readonly telecomOrganizationId: string;
  readonly bankOrganizationId: string;
}

export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly store: OperationsReadModel;
  readonly evaluate: EvaluatePaymentRiskUseCase;
  readonly queueAdmin: QueueAdmin;
  readonly providerMode: ProviderMode;
  readonly syntheticOrganizationId: string;
  readonly syntheticSubjectRef: string;
  readonly startedAtMs: number;
  readonly partner?: PartnerRuntime;
  readonly disconnect: () => Promise<void>;
}

export const buildContainer = async (config: AppConfig, logger: Logger): Promise<Container> => {
  const providerMode: ProviderMode = config.runtime.providerMode;
  const clock = createSystemClock();
  const ids = createUlidIdGenerator();

  if (providerMode === 'in-memory') {
    const unitOfWork = createInMemoryUnitOfWork(clock);
    const audit = createInMemoryAuditProvider(ids, clock, unitOfWork);
    const store = createInMemoryOperationsStore(clock);
    const evaluate = createEvaluatePaymentRiskUseCase({ clock, ids, audit, unitOfWork });
    const queueAdmin = createQueueAdmin({ config, providerMode, clock });
    return {
      config,
      logger,
      clock,
      ids,
      store,
      evaluate,
      queueAdmin,
      providerMode,
      syntheticOrganizationId: ids.generate(),
      syntheticSubjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
      startedAtMs: Date.now(),
      disconnect: async () => undefined,
    };
  }

  if (providerMode !== 'real') {
    throw new Error(`Provider mode "${providerMode as string}" is not available.`);
  }

  const prisma = createPrismaClient({ config });
  const unitOfWork = createPrismaUnitOfWork(prisma, config.database.transactionTimeoutMs);
  const audit = createPrismaAuditProvider(unitOfWork, ids, clock);
  const outbox = createPrismaOutboxRepository(prisma, unitOfWork);
  const persistence = createPrismaDecisionPersistence({
    unitOfWork,
    ids,
    outbox,
    correlationWindowMs: config.decision.correlationWindowSeconds * 1000,
    outboxMaxAttempts: config.worker.outboxMaxAttempts,
  });
  const store = createPostgresOperationsStore(prisma, clock);
  const evaluate = createEvaluatePaymentRiskUseCase({ clock, ids, audit, unitOfWork, persistence });

  const cache = createRedisCacheProvider(config);
  const queue = createBullmqQueueProvider(config);
  const queueStore = createPostgresQueueStore(prisma);
  const queueAdmin = createQueueAdmin({
    config,
    providerMode,
    clock,
    cache,
    queue,
    outboxStore: queueStore,
  });

  const bank = await prisma.organization.findUnique({ where: { slug: SYNTHETIC_BANK_SLUG } });
  const telecom = await prisma.organization.findUnique({ where: { slug: SYNTHETIC_TELECOM_SLUG } });
  if (bank === null || telecom === null) {
    await prisma.$disconnect();
    await cache.close();
    await queue.close();
    throw new Error(
      `Real provider mode requires the seeded "${SYNTHETIC_BANK_SLUG}" and "${SYNTHETIC_TELECOM_SLUG}" organizations. Run pnpm db:seed.`,
    );
  }

  const connections = createPrismaPartnerConnectionRepository(prisma, unitOfWork);
  const keys = createPrismaPartnerSigningKeyRepository(prisma, unitOfWork);
  const directory = createPrismaPartnerDirectory(prisma);
  const activity = createPrismaPartnerApiActivityStore(prisma);
  const domain = createPrismaPartnerDomainStore(prisma);
  const idempotencyKeys = createPrismaIdempotencyRepository(prisma);
  const signatures = createJwsSignatureVerifier({
    keys,
    clock,
    allowedAlgorithms: config.signing.allowedAlgorithms,
    timestampSkewSeconds: config.signing.timestampSkewSeconds,
    replayWindowSeconds: config.signing.replayWindowSeconds,
  });
  const authenticator = createPartnerAuthenticator({
    config,
    clock,
    ids,
    cache,
    connections,
    keys,
    signatures,
    directory,
    activity,
  });
  const admin = createPartnerAdmin({
    config,
    clock,
    ids,
    random: createNodeSecureRandom(),
    hasher: createArgon2PasswordHasher(),
    connections,
    keys,
    directory,
    audit,
    unitOfWork,
  });
  const ingest = createPartnerIngest({
    clock,
    ids,
    audit,
    domain,
    evaluate,
  });
  const sandbox = createPartnerSandbox({
    clock,
    ids,
    admin,
    ingest,
    authenticator,
    telecomOrganizationId: telecom.id,
    bankOrganizationId: bank.id,
  });

  return {
    config,
    logger,
    clock,
    ids,
    store,
    evaluate,
    queueAdmin,
    providerMode,
    syntheticOrganizationId: bank.id,
    syntheticSubjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
    startedAtMs: Date.now(),
    partner: {
      authenticator,
      idempotency: createPartnerIdempotency({ config, clock, ids, keys: idempotencyKeys }),
      admin,
      ingest,
      sandbox,
      activity,
      directory,
      connections,
      keys,
      telecomOrganizationId: telecom.id,
      bankOrganizationId: bank.id,
    },
    disconnect: async () => {
      await queue.close();
      await cache.close();
      await prisma.$disconnect();
    },
  };
};
