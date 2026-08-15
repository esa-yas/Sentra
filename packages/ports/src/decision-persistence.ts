import type {
  OperationalEvent,
  Purpose,
  RecommendationView,
  SimulatorEvaluateRequest,
  FlowRun,
} from '@sentra/contracts';
import type { TransactionScope } from './unit-of-work';

/**
 * Consent lookup outcomes. Missing and unavailable must never be treated as granted.
 */
export const CONSENT_LOOKUP_STATUSES = {
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  MISSING: 'MISSING',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type ConsentLookupStatus =
  (typeof CONSENT_LOOKUP_STATUSES)[keyof typeof CONSENT_LOOKUP_STATUSES];

export interface ConsentLookupResult {
  readonly status: ConsentLookupStatus;
}

export interface PersistDecisionJourneyInput {
  readonly organizationId: string;
  readonly subjectRef: string;
  readonly correlationId: string;
  readonly actorLabel: string;
  readonly input: SimulatorEvaluateRequest;
  readonly recommendation: RecommendationView;
  readonly events: readonly OperationalEvent[];
  readonly flow: FlowRun;
  readonly telecomUsable: boolean;
  readonly consentStatus: ConsentLookupStatus;
  readonly now: Date;
}

export interface PersistedDecisionJourney {
  readonly recommendation: RecommendationView;
  readonly events: readonly OperationalEvent[];
  readonly flow: FlowRun;
}

/**
 * Persistence required by the evaluate-payment-risk use case. Optional in in-memory mode
 * so Slice 1 tests stay hermetic. Real mode always supplies a PostgreSQL implementation.
 *
 * Writes must enlist in the caller's {@link TransactionScope} so domain rows, audit, and
 * outbox share one fate.
 */
export interface DecisionPersistence {
  lookupConsent(
    scope: TransactionScope,
    input: {
      readonly organizationId: string;
      readonly subjectRef: string;
      readonly purpose: Purpose;
      readonly now: Date;
    },
  ): Promise<ConsentLookupResult>;

  /**
   * Returns a previously persisted journey for this tenant + correlation id, if any.
   * Used so a retried evaluate does not insert a second case.
   */
  findByCorrelation(
    scope: TransactionScope,
    organizationId: string,
    correlationId: string,
  ): Promise<PersistedDecisionJourney | null>;

  persistJourney(scope: TransactionScope, input: PersistDecisionJourneyInput): Promise<void>;
}
