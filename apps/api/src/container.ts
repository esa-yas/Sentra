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
  createPrismaAuditReadStore,
  createPostgresQueueStore,
  createPrismaAuditProvider,
  createPrismaDecisionPersistence,
  createPrismaIdempotencyRepository,
  createPrismaOutboxRepository,
  createPrismaPartnerApiActivityStore,
  createPrismaPartnerConnectionRepository,
  createPrismaPartnerDirectory,
  createPrismaPartnerDomainStore,
  createPrismaProtectionSessionStore,
  createPrismaPartnerSigningKeyRepository,
  createPrismaApiKeyRepository,
  createPrismaInvitationRepository,
  createPrismaIdentityLinkRepository,
  createPrismaMembershipRepository,
  createPrismaOrganizationRepository,
  createPrismaUnitOfWork,
  createPrismaUserRepository,
  createRedisCacheProvider,
  createResendEmailSender,
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
import type { AuditReadModel, Clock, IdGenerator, OperationsReadModel } from '@sentra/ports';
import { createQueueAdmin, type QueueAdmin } from './queue-admin';
import { createApiKeyAdmin, type ApiKeyAdmin } from './auth/api-key-admin';
import {
  createInvitationAdmin,
  createInvitationMailer,
  type InvitationAdmin,
} from './auth/invitation-admin';
import { createMemberAdmin, type MemberAdmin } from './auth/member-admin';
import { createOrgAdmin, type OrgAdmin } from './auth/org-admin';
import { createOrgSignup, type OrgSignup } from './auth/org-signup';
import { createPartnerAdmin, type PartnerAdmin } from './partner/admin';
import { createPartnerAuthenticator, type PartnerAuthenticator } from './partner/authenticator';
import { createPartnerIdempotency, type PartnerIdempotency } from './partner/idempotency';
import { createPartnerIngest, type PartnerIngest } from './partner/ingest';
import { createPartnerSandbox, type PartnerSandbox } from './partner/sandbox';
import {
  createProtectionSessionService,
  type ProtectionSessionService,
} from './partner/protection-session';
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
  readonly protectionSessions: ProtectionSessionService;
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
  readonly memberAdmin: MemberAdmin;
  readonly orgSignup: OrgSignup;
  readonly orgAdmin: OrgAdmin;
  readonly apiKeyAdmin: ApiKeyAdmin;
  readonly invitationAdmin: InvitationAdmin;
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
  /** Audit read + hash-chain verification. Wired in real provider mode only. */
  readonly auditRead?: AuditReadModel;
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
  const auditRead = createPrismaAuditReadStore(prisma, clock, config.limits.auditVerifyMaxEvents);
  const evaluate = createEvaluatePaymentRiskUseCase({ clock, ids, audit, unitOfWork, persistence });

  const userTokenVerifier = buildUserTokenVerifier(config, clock);
  let auth: UserAuthRuntime | undefined;
  if (userTokenVerifier !== undefined) {
    const users = createPrismaUserRepository(prisma, unitOfWork);
    const identities = createPrismaIdentityLinkRepository(prisma, unitOfWork);
    const memberships = createPrismaMembershipRepository(prisma, unitOfWork);
    const organizations = createPrismaOrganizationRepository(prisma, unitOfWork);
    const apiKeys = createPrismaApiKeyRepository(prisma, unitOfWork);
    const invitations = createPrismaInvitationRepository(prisma, unitOfWork);
    auth = {
      resolve: createResolveUserPrincipalUseCase({
        clock,
        ids,
        unitOfWork,
        verifier: userTokenVerifier,
        users,
        identities,
        memberships,
      }),
      memberAdmin: createMemberAdmin({ memberships, users, unitOfWork, audit, ids, clock }),
      orgSignup: createOrgSignup({ organizations, memberships, unitOfWork, audit, ids, clock }),
      orgAdmin: createOrgAdmin({ organizations, unitOfWork, audit, clock }),
      apiKeyAdmin: createApiKeyAdmin({
        organizations,
        apiKeys,
        random: createNodeSecureRandom(),
        hasher: createArgon2PasswordHasher(),
        audit,
        unitOfWork,
        ids,
        clock,
      }),
      invitationAdmin: createInvitationAdmin({
        invitations,
        memberships,
        organizations,
        users,
        unitOfWork,
        audit,
        ids,
        clock,
        logger,
        consoleBaseUrl: config.email.consoleBaseUrl,
        sendMail: createInvitationMailer(
          createResendEmailSender(
            {
              ...(config.email.resendApiKey === undefined
                ? {}
                : { apiKey: config.email.resendApiKey }),
              ...(config.email.fromAddress === undefined
                ? {}
                : { fromAddress: config.email.fromAddress }),
              ...(config.email.replyTo === undefined ? {} : { replyTo: config.email.replyTo }),
            },
            logger,
          ),
          7,
        ),
      }),
    };
  }

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
  const protectionSessions = createProtectionSessionService({
    clock,
    ids,
    audit,
    store: createPrismaProtectionSessionStore(prisma),
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
    auditRead,
    partner: {
      authenticator,
      idempotency: createPartnerIdempotency({ config, clock, ids, keys: idempotencyKeys }),
      admin,
      ingest,
      sandbox,
      protectionSessions,
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
