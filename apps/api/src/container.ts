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
  createPrismaIdentityLinkRepository,
  createPrismaMembershipRepository,
  createPrismaUnitOfWork,
  createPrismaUserRepository,
  createRedisCacheProvider,
  createSupabaseUserTokenVerifier,
  createSystemClock,
  createUlidIdGenerator,
} from '@sentra/adapters';
import { createPrismaClient } from '@sentra/db';
import {
  SYNTHETIC_BANK_SLUG,
  SYNTHETIC_DEMO_SUBJECT_REF,
  SYNTHETIC_TELECOM_SLUG,
  createEvaluatePaymentRiskUseCase,
  createResolveUserPrincipalUseCase,
  type EvaluatePaymentRiskUseCase,
  type ResolveUserPrincipalUseCase,
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

/** Human authentication runtime, wired only when a Supabase verifier is configured. */
export interface UserAuthRuntime {
  readonly resolve: ResolveUserPrincipalUseCase;
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
  readonly auth?: UserAuthRuntime;
  readonly disconnect: () => Promise<void>;
}

/**
 * Builds the Supabase user-token verifier from configuration, preferring asymmetric
 * verification against the project's published JWKS (slide 053) and falling back to the
 * legacy shared secret only when no JWKS endpoint is configured. Returns `undefined` when
 * neither is set, in which case human authentication is simply not offered.
 */
const buildUserTokenVerifier = (config: AppConfig, clock: Clock) => {
  const audience = config.supabase.jwtAudience;
  const clockToleranceSeconds = config.partnerAuth.clockToleranceSeconds;
  // Supabase signs tokens with the project's auth URL as `iss`; derive it from the project
  // URL so a stale SUPABASE_JWT_ISSUER cannot cause a false issuer mismatch.
  const issuer =
    config.supabase.url !== undefined
      ? `${config.supabase.url.replace(/\/$/, '')}/auth/v1`
      : config.supabase.jwtIssuer;

  if (config.supabase.jwksUrl !== undefined) {
    return createSupabaseUserTokenVerifier({
      clock,
      ...(issuer === undefined ? {} : { issuer }),
      audience,
      allowedAlgorithms: ['ES256', 'RS256'],
      jwksUrl: config.supabase.jwksUrl,
      jwksCacheSeconds: config.supabase.jwksCacheSeconds,
      clockToleranceSeconds,
    });
  }
  if (config.supabase.jwtSecret !== undefined) {
    return createSupabaseUserTokenVerifier({
      clock,
      ...(issuer === undefined ? {} : { issuer }),
      audience,
      allowedAlgorithms: ['HS256'],
      sharedSecret: config.supabase.jwtSecret,
      clockToleranceSeconds,
    });
  }
  return undefined;
};

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

  const userTokenVerifier = buildUserTokenVerifier(config, clock);
  const auth: UserAuthRuntime | undefined =
    userTokenVerifier === undefined
      ? undefined
      : {
          resolve: createResolveUserPrincipalUseCase({
            clock,
            ids,
            unitOfWork,
            verifier: userTokenVerifier,
            users: createPrismaUserRepository(prisma, unitOfWork),
            identities: createPrismaIdentityLinkRepository(prisma, unitOfWork),
            memberships: createPrismaMembershipRepository(prisma, unitOfWork),
          }),
        };

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
    ...(auth === undefined ? {} : { auth }),
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
