import type { AppConfig } from '@sentra/config';
import {
  createInMemoryAuditProvider,
  createInMemoryOperationsStore,
  createInMemoryUnitOfWork,
  createSystemClock,
  createUlidIdGenerator,
  type InMemoryOperationsStore,
} from '@sentra/adapters';
import { createEvaluatePaymentRiskUseCase, type EvaluatePaymentRiskUseCase } from '@sentra/core';
import type { Logger } from '@sentra/observability';
import type { Clock, IdGenerator } from '@sentra/ports';

/**
 * The composition root. It is the one place allowed to know which concrete adapters are
 * wired, and it selects them by mode so the rest of the API depends only on the assembled
 * dependencies. Version 1a ships a single `in-memory` mode; Slice 2 adds a `real` mode
 * (Postgres/Redis) behind the same interfaces, switchable here without touching routes.
 */
export type ProviderMode = 'in-memory' | 'real';

export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly store: InMemoryOperationsStore;
  readonly evaluate: EvaluatePaymentRiskUseCase;
  readonly providerMode: ProviderMode;
  /** A session-stable synthetic tenant id, so dashboard grouping is coherent. */
  readonly syntheticOrganizationId: string;
  readonly startedAtMs: number;
}

export const buildContainer = (config: AppConfig, logger: Logger): Container => {
  const providerMode: ProviderMode = config.runtime.providerMode;

  if (providerMode !== 'in-memory') {
    // Real adapters arrive in Slice 2+. Fail loud rather than pretend.
    throw new Error(`Provider mode "${providerMode}" is not available yet. Use "in-memory" for Version 1a.`);
  }

  const clock = createSystemClock();
  const ids = createUlidIdGenerator();
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
    startedAtMs: Date.now(),
  };
};
