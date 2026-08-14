import { DECISION_REASON_CODES, type DecisionReasonCode } from '@sentra/contracts';

/**
 * Reason-code catalogue. Weights are configuration, not hidden model logic (slide 067):
 * they live here in plain sight, are versioned with the rules, and are covered by fixture
 * tests. Each code carries a stable machine value and a plain-language rendering so the
 * console and a partner API show the same explanation (slide 069).
 *
 * `baseWeight` is the contribution when the signal is present at its ordinary strength.
 * Some signals scale their contribution (for example a larger payment or a worse caller
 * reputation); the engine computes the final contribution and never exceeds `maxWeight`,
 * which caps any single signal's influence.
 */
export type ReasonCategory = 'PAYMENT' | 'TELECOM' | 'IDENTITY' | 'BEHAVIOR' | 'CAMPAIGN';

export interface ReasonCodeDefinition {
  readonly code: DecisionReasonCode;
  readonly title: string;
  readonly description: string;
  readonly category: ReasonCategory;
  readonly baseWeight: number;
  readonly maxWeight: number;
}

export const REASON_CODE_DEFINITIONS: Readonly<Record<DecisionReasonCode, ReasonCodeDefinition>> = {
  [DECISION_REASON_CODES.NEW_PAYEE]: {
    code: DECISION_REASON_CODES.NEW_PAYEE,
    title: 'First-time payee',
    description: 'The customer has never paid this payee before, a common trait of scam-directed payments.',
    category: 'PAYMENT',
    baseWeight: 12,
    maxWeight: 12,
  },
  [DECISION_REASON_CODES.NEW_PAYEE_ACCOUNT]: {
    code: DECISION_REASON_CODES.NEW_PAYEE_ACCOUNT,
    title: 'Recently established payee',
    description: 'The payee relationship is only days old, leaving little trusted history.',
    category: 'PAYMENT',
    baseWeight: 8,
    maxWeight: 8,
  },
  [DECISION_REASON_CODES.HIGH_VALUE_PAYMENT]: {
    code: DECISION_REASON_CODES.HIGH_VALUE_PAYMENT,
    title: 'High-value payment',
    description: 'The payment amount is large relative to typical protected payments.',
    category: 'PAYMENT',
    baseWeight: 10,
    maxWeight: 18,
  },
  [DECISION_REASON_CODES.ELEVATED_PAYMENT_VELOCITY]: {
    code: DECISION_REASON_CODES.ELEVATED_PAYMENT_VELOCITY,
    title: 'Elevated payment velocity',
    description: 'An unusual number of payments were initiated in a short window.',
    category: 'PAYMENT',
    baseWeight: 8,
    maxWeight: 12,
  },
  [DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL]: {
    code: DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL,
    title: 'Recent suspicious call',
    description: 'A consented telecom signal reports a suspicious call close to the payment.',
    category: 'TELECOM',
    baseWeight: 15,
    maxWeight: 15,
  },
  [DECISION_REASON_CODES.LOW_CALLER_REPUTATION]: {
    code: DECISION_REASON_CODES.LOW_CALLER_REPUTATION,
    title: 'Low caller reputation',
    description: 'The originating number carries a poor reputation from consented reporting.',
    category: 'TELECOM',
    baseWeight: 10,
    maxWeight: 18,
  },
  [DECISION_REASON_CODES.PROLONGED_CALL_BEFORE_PAYMENT]: {
    code: DECISION_REASON_CODES.PROLONGED_CALL_BEFORE_PAYMENT,
    title: 'Prolonged call before payment',
    description: 'A lengthy call overlapped the payment, consistent with live coaching.',
    category: 'TELECOM',
    baseWeight: 10,
    maxWeight: 10,
  },
  [DECISION_REASON_CODES.RECENT_DEVICE_CHANGE]: {
    code: DECISION_REASON_CODES.RECENT_DEVICE_CHANGE,
    title: 'Recent device change',
    description: 'The customer authenticated from a newly seen device shortly before paying.',
    category: 'BEHAVIOR',
    baseWeight: 8,
    maxWeight: 8,
  },
  [DECISION_REASON_CODES.ACCOUNT_TAKEOVER_SIGNALS]: {
    code: DECISION_REASON_CODES.ACCOUNT_TAKEOVER_SIGNALS,
    title: 'Account-takeover indicators',
    description: 'Signals consistent with account takeover were observed on this account.',
    category: 'BEHAVIOR',
    baseWeight: 22,
    maxWeight: 22,
  },
  [DECISION_REASON_CODES.SCAM_CAMPAIGN_MATCH]: {
    code: DECISION_REASON_CODES.SCAM_CAMPAIGN_MATCH,
    title: 'Known scam-campaign match',
    description: 'The pattern matches an active, known scam campaign.',
    category: 'CAMPAIGN',
    baseWeight: 25,
    maxWeight: 25,
  },
  [DECISION_REASON_CODES.CUSTOMER_VULNERABILITY]: {
    code: DECISION_REASON_CODES.CUSTOMER_VULNERABILITY,
    title: 'Customer vulnerability indicator',
    description: 'A vulnerability indicator suggests a lower-friction, protective intervention.',
    category: 'BEHAVIOR',
    baseWeight: 8,
    maxWeight: 8,
  },
  [DECISION_REASON_CODES.IDENTITY_VERIFICATION_FAILED]: {
    code: DECISION_REASON_CODES.IDENTITY_VERIFICATION_FAILED,
    title: 'Identity verification failed',
    description: 'A step-up identity check did not pass for this session.',
    category: 'IDENTITY',
    baseWeight: 15,
    maxWeight: 15,
  },
  [DECISION_REASON_CODES.PRIOR_SCAM_WARNINGS]: {
    code: DECISION_REASON_CODES.PRIOR_SCAM_WARNINGS,
    title: 'Prior scam warnings',
    description: 'The customer was warned about scam risk on earlier payments.',
    category: 'BEHAVIOR',
    baseWeight: 6,
    maxWeight: 12,
  },
};
