import type { AppConfig } from '@sentra/config';
import {
  createInMemoryAuditProvider,
  createInMemoryOperationsStore,
  createInMemoryUnitOfWork,
  createPostgresOperationsStore,
  createPrismaAuditProvider,
  createPrismaDecisionPersistence,
  createPrismaOutboxRepository,
  createPrismaUnitOfWork,
  createSystemClock,
  createUlidIdGenerator,
} from '@sentra/adapters';
import { createPrismaClient } from '@sentra/db';
import {
  SYNTHETIC_BANK_SLUG,
  SYNTHETIC_DEMO_SUBJECT_REF,
  createEvaluatePaymentRiskUseCase,
  type EvaluatePaymentRiskUseCase,
} from '@sentra/core';
import type { Logger } from '@sentra/observability';
import type { Clock, IdGenerator, OperationsReadModel } from '@sentra/ports';

/**
 * The composition root. The only place allowed to know which concrete adapters are wired.
 */
export type ProviderMode = 'in-memory' | 'real';

export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly store: OperationsReadModel;
  readonly evaluate: EvaluatePaymentRiskUseCase;
  readonly providerMode: ProviderMode;
  readonly syntheticOrganizationId: string;
  readonly syntheticSubjectRef: string;
  readonly startedAtMs: number;
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
    return {
      config,
      logger,
      clock,
      ids,
      store,
      evaluate,
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

  const bank = await prisma.organization.findUnique({ where: { slug: SYNTHETIC_BANK_SLUG } });
  if (bank === null) {
    await prisma.$disconnect();
    throw new Error(
      `Real provider mode requires the seeded "${SYNTHETIC_BANK_SLUG}" organization. Run pnpm db:seed.`,
    );
  }

  return {
    config,
    logger,
    clock,
    ids,
    store,
    evaluate,
    providerMode,
    syntheticOrganizationId: bank.id,
    syntheticSubjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
    startedAtMs: Date.now(),
    disconnect: async () => {
      await prisma.$disconnect();
    },
  };
};
