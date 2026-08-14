import { z } from 'zod';
import { correlationIdSchema, subjectRefSchema, ulidSchema } from '../identifiers';

/**
 * The synchronous scam-risk decision contract, shared by the core engine, the Express
 * edge, and the console. Slide 067 keeps scoring deterministic and explainable, and slide
 * 069 requires every recommendation to carry its reasons and versions. These schemas are
 * the single definition of that shape — the frontend never redeclares it.
 *
 * The bank always makes the final decision (slides 010, 030). The strongest action the
 * network ever returns is a *recommendation*; there is no autonomous block.
 */

export const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskLevel = (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];

export const riskLevelSchema = z.enum([
  RISK_LEVELS.LOW,
  RISK_LEVELS.MEDIUM,
  RISK_LEVELS.HIGH,
  RISK_LEVELS.CRITICAL,
]);

/**
 * Recommended actions. Every value is advisory. `BLOCK_RECOMMENDED` is the highest tier
 * (slide 060's emergency recommendation) and is still a recommendation to the bank, not an
 * action the network takes itself.
 */
export const RECOMMENDATION_ACTIONS = {
  ALLOW: 'ALLOW',
  WARN: 'WARN',
  REQUIRE_CALLBACK: 'REQUIRE_CALLBACK',
  REQUIRE_ANALYST_REVIEW: 'REQUIRE_ANALYST_REVIEW',
  DELAY: 'DELAY',
  BLOCK_RECOMMENDED: 'BLOCK_RECOMMENDED',
} as const;

export type RecommendationAction =
  (typeof RECOMMENDATION_ACTIONS)[keyof typeof RECOMMENDATION_ACTIONS];

export const recommendationActionSchema = z.enum([
  RECOMMENDATION_ACTIONS.ALLOW,
  RECOMMENDATION_ACTIONS.WARN,
  RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK,
  RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW,
  RECOMMENDATION_ACTIONS.DELAY,
  RECOMMENDATION_ACTIONS.BLOCK_RECOMMENDED,
]);

/**
 * Stable reason codes with plain-language renderings (slide 069). Codes never change
 * meaning; a code may be added, but an existing one is not repurposed.
 */
export const DECISION_REASON_CODES = {
  NEW_PAYEE: 'NEW_PAYEE',
  NEW_PAYEE_ACCOUNT: 'NEW_PAYEE_ACCOUNT',
  HIGH_VALUE_PAYMENT: 'HIGH_VALUE_PAYMENT',
  ELEVATED_PAYMENT_VELOCITY: 'ELEVATED_PAYMENT_VELOCITY',
  RECENT_SUSPICIOUS_CALL: 'RECENT_SUSPICIOUS_CALL',
  LOW_CALLER_REPUTATION: 'LOW_CALLER_REPUTATION',
  PROLONGED_CALL_BEFORE_PAYMENT: 'PROLONGED_CALL_BEFORE_PAYMENT',
  RECENT_DEVICE_CHANGE: 'RECENT_DEVICE_CHANGE',
  ACCOUNT_TAKEOVER_SIGNALS: 'ACCOUNT_TAKEOVER_SIGNALS',
  SCAM_CAMPAIGN_MATCH: 'SCAM_CAMPAIGN_MATCH',
  CUSTOMER_VULNERABILITY: 'CUSTOMER_VULNERABILITY',
  IDENTITY_VERIFICATION_FAILED: 'IDENTITY_VERIFICATION_FAILED',
  PRIOR_SCAM_WARNINGS: 'PRIOR_SCAM_WARNINGS',
} as const;

export type DecisionReasonCode =
  (typeof DECISION_REASON_CODES)[keyof typeof DECISION_REASON_CODES];

export const decisionReasonCodeSchema = z.enum([
  DECISION_REASON_CODES.NEW_PAYEE,
  DECISION_REASON_CODES.NEW_PAYEE_ACCOUNT,
  DECISION_REASON_CODES.HIGH_VALUE_PAYMENT,
  DECISION_REASON_CODES.ELEVATED_PAYMENT_VELOCITY,
  DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL,
  DECISION_REASON_CODES.LOW_CALLER_REPUTATION,
  DECISION_REASON_CODES.PROLONGED_CALL_BEFORE_PAYMENT,
  DECISION_REASON_CODES.RECENT_DEVICE_CHANGE,
  DECISION_REASON_CODES.ACCOUNT_TAKEOVER_SIGNALS,
  DECISION_REASON_CODES.SCAM_CAMPAIGN_MATCH,
  DECISION_REASON_CODES.CUSTOMER_VULNERABILITY,
  DECISION_REASON_CODES.IDENTITY_VERIFICATION_FAILED,
  DECISION_REASON_CODES.PRIOR_SCAM_WARNINGS,
]);

/**
 * The availability of an evidence source for one evaluation. Slide 035 requires these to
 * stay distinct: `UNAVAILABLE` and `NO_CONSENT` must never be read as "no risk".
 */
export const EVIDENCE_AVAILABILITY = {
  OK: 'OK',
  OK_NO_SIGNALS: 'OK_NO_SIGNALS',
  NO_CONSENT: 'NO_CONSENT',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type EvidenceAvailability =
  (typeof EVIDENCE_AVAILABILITY)[keyof typeof EVIDENCE_AVAILABILITY];

export const evidenceAvailabilitySchema = z.enum([
  EVIDENCE_AVAILABILITY.OK,
  EVIDENCE_AVAILABILITY.OK_NO_SIGNALS,
  EVIDENCE_AVAILABILITY.NO_CONSENT,
  EVIDENCE_AVAILABILITY.UNAVAILABLE,
]);

export const IDENTITY_VERIFICATION_RESULTS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_CHECKED: 'NOT_CHECKED',
} as const;

export type IdentityVerificationResult =
  (typeof IDENTITY_VERIFICATION_RESULTS)[keyof typeof IDENTITY_VERIFICATION_RESULTS];

export const identityVerificationResultSchema = z.enum([
  IDENTITY_VERIFICATION_RESULTS.PASS,
  IDENTITY_VERIFICATION_RESULTS.FAIL,
  IDENTITY_VERIFICATION_RESULTS.NOT_CHECKED,
]);

export const CALLER_REPUTATIONS = {
  UNKNOWN: 'UNKNOWN',
  TRUSTED: 'TRUSTED',
  SUSPECT: 'SUSPECT',
  KNOWN_BAD: 'KNOWN_BAD',
} as const;

export type CallerReputation = (typeof CALLER_REPUTATIONS)[keyof typeof CALLER_REPUTATIONS];

export const callerReputationSchema = z.enum([
  CALLER_REPUTATIONS.UNKNOWN,
  CALLER_REPUTATIONS.TRUSTED,
  CALLER_REPUTATIONS.SUSPECT,
  CALLER_REPUTATIONS.KNOWN_BAD,
]);

/**
 * Synthetic inputs a developer or analyst supplies to the simulator. These are the tunable
 * factors from the product brief. All are synthetic; the platform never receives raw
 * telephone numbers, account numbers, or card data (enforced by the deny-list).
 */
export const simulatorEvaluateRequestSchema = z.object({
  /** Opaque, pairwise reference. Optional in the simulator; a synthetic one is generated. */
  subjectRef: subjectRefSchema.optional(),
  organizationId: ulidSchema.optional(),
  /** Caller-supplied correlation id, so a partner can join our trace to theirs. */
  correlationId: correlationIdSchema.optional(),

  paymentAmount: z.number().nonnegative().max(100_000_000),
  currency: z.string().length(3).default('GBP'),
  /** Age of the payee relationship in days. 0 means first-ever payee. */
  payeeAgeDays: z.number().int().min(0).max(36_500).default(0),
  firstTimePayee: z.boolean().default(false),
  /** Count of payments the customer made in the last 24 hours. */
  paymentVelocity24h: z.number().int().min(0).max(1_000).default(0),

  /** Telecom-derived signals. The availability field keeps missing data fail-neutral. */
  telecomEvidence: evidenceAvailabilitySchema.default(EVIDENCE_AVAILABILITY.OK),
  recentSuspiciousCall: z.boolean().default(false),
  callerReputation: callerReputationSchema.default(CALLER_REPUTATIONS.UNKNOWN),
  callDurationSeconds: z.number().int().min(0).max(86_400).default(0),

  deviceChange: z.boolean().default(false),
  accountTakeoverIndicators: z.boolean().default(false),
  scamCampaignMatch: z.boolean().default(false),
  customerVulnerability: z.boolean().default(false),
  identityVerificationResult: identityVerificationResultSchema.default(
    IDENTITY_VERIFICATION_RESULTS.NOT_CHECKED,
  ),
  previousWarnings: z.number().int().min(0).max(1_000).default(0),
});

export type SimulatorEvaluateRequest = z.infer<typeof simulatorEvaluateRequestSchema>;

/** One reason code with the weight it contributed to the score and its plain-language text. */
export const contributingSignalSchema = z.object({
  code: decisionReasonCodeSchema,
  title: z.string(),
  description: z.string(),
  /** Points this signal added to the raw score. */
  contribution: z.number(),
  category: z.enum(['PAYMENT', 'TELECOM', 'IDENTITY', 'BEHAVIOR', 'CAMPAIGN']),
});

export type ContributingSignal = z.infer<typeof contributingSignalSchema>;

/** A named evidence source and whether it was usable for this evaluation. */
export const evidenceSourceStateSchema = z.object({
  source: z.string(),
  availability: evidenceAvailabilitySchema,
  detail: z.string().optional(),
});

export type EvidenceSourceState = z.infer<typeof evidenceSourceStateSchema>;

/** A short, safe summary of an audit event generated during the evaluation. */
export const auditEventSummarySchema = z.object({
  id: ulidSchema.or(z.string()),
  action: z.string(),
  chainKey: z.string(),
  sequence: z.string(),
  hashPrev: z.string(),
  hashSelf: z.string(),
  occurredAt: z.string().datetime(),
});

export type AuditEventSummary = z.infer<typeof auditEventSummarySchema>;

/**
 * The explainable recommendation. Slide 069: action, reasons, uncertainty, and every
 * version needed to reproduce it. `synthetic` is always true in Version 1a.
 */
export const recommendationViewSchema = z.object({
  decisionId: z.string(),
  correlationId: correlationIdSchema,
  subjectRef: z.string(),
  organizationId: z.string(),

  riskScore: z.number().min(0).max(100),
  riskLevel: riskLevelSchema,
  /** 0..1. Rises when evidence is missing or stale; never lowers the score. */
  uncertainty: z.number().min(0).max(1),

  recommendedAction: recommendationActionSchema,
  /** Other actions the policy considered acceptable, most-to-least conservative. */
  alternativeActions: z.array(recommendationActionSchema),

  reasonCodes: z.array(decisionReasonCodeSchema),
  contributingSignals: z.array(contributingSignalSchema),
  rulesTriggered: z.array(z.string()),
  evidenceSources: z.array(evidenceSourceStateSchema),
  /** Sources that could not contribute; kept explicit so missing data is never zero risk. */
  missingProviders: z.array(z.string()),

  policyVersion: z.string(),
  rulesVersion: z.string(),
  /** Present only when an AI adapter contributed. Null on the deterministic path. */
  modelVersion: z.string().nullable(),

  processingTimeMs: z.number().nonnegative(),
  evaluatedAt: z.string().datetime(),

  /** Plain-language sentence a console can show above the score. */
  summary: z.string(),
  /** Reminder that the bank decides; never an autonomous block. */
  authorityNote: z.string(),

  auditEvents: z.array(auditEventSummarySchema),
  synthetic: z.boolean(),
});

export type RecommendationView = z.infer<typeof recommendationViewSchema>;

/** A preset synthetic scenario the console can load into the simulator. */
export const simulatorScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  expectedLevel: riskLevelSchema,
  input: simulatorEvaluateRequestSchema,
});

export type SimulatorScenario = z.infer<typeof simulatorScenarioSchema>;

export const simulatorScenarioListSchema = z.object({
  items: z.array(simulatorScenarioSchema),
});

export type SimulatorScenarioList = z.infer<typeof simulatorScenarioListSchema>;
