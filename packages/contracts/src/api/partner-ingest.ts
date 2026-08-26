import { z } from 'zod';
import { correlationIdSchema, subjectRefSchema, ulidSchema } from '../identifiers';
import {
  callerReputationSchema,
  evidenceAvailabilitySchema,
  identityVerificationResultSchema,
  recommendationViewSchema,
} from './decision';
import { eventSeveritySchema } from './operations';
import { purposeSchema } from '../purpose';

/**
 * Partner ingest contracts. These are the production `/v1` wire shapes. The simulator
 * remains a separate, unauthenticated development interface and is not used on this path.
 */

/** Default and maximum lifetime of a telecom risk signal, in seconds (5 minutes). */
export const TELECOM_ACTIVE_WINDOW_SECONDS = 300;

export const telecomRiskEventRequestSchema = z
  .object({
    subjectRef: subjectRefSchema,
    purpose: purposeSchema.default('PROTECT_PAYMENT'),
    eventType: z.string().min(3).max(64).default('scam.risk.v1'),
    recentSuspiciousCall: z.boolean().default(false),
    callerReputation: callerReputationSchema.default('UNKNOWN'),
    callDurationSeconds: z.number().int().min(0).max(86_400).default(0),
    deviceChange: z.boolean().default(false),
    accountTakeoverIndicators: z.boolean().default(false),
    scamCampaignMatch: z.boolean().default(false),
    telecomEvidence: evidenceAvailabilitySchema.default('OK'),
    severity: eventSeveritySchema.default('INFO'),
    observedAt: z.string().datetime().optional(),
    /**
     * How long this signal stays "live" for correlation, in seconds. A suspicious call is only
     * useful while it is happening, so the window is short and capped at 5 minutes — emit the
     * event when the call starts and it will correlate with any payment made in the next 5
     * minutes, after which it is treated as stale.
     */
    activeWindowSeconds: z.number().int().min(30).max(TELECOM_ACTIVE_WINDOW_SECONDS).default(TELECOM_ACTIVE_WINDOW_SECONDS),
  })
  .strict();

export type TelecomRiskEventRequest = z.infer<typeof telecomRiskEventRequestSchema>;

export const telecomRiskEventResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema,
  subjectRef: z.string(),
  correlationId: correlationIdSchema,
  receivedAt: z.string().datetime(),
  synthetic: z.boolean(),
});

export type TelecomRiskEventResponse = z.infer<typeof telecomRiskEventResponseSchema>;

export const paymentIntentRequestSchema = z
  .object({
    subjectRef: subjectRefSchema,
    purpose: purposeSchema.default('PROTECT_PAYMENT'),
    paymentAmount: z.number().nonnegative().max(100_000_000),
    currency: z.string().length(3).default('GBP'),
    payeeAgeDays: z.number().int().min(0).max(36_500).default(0),
    firstTimePayee: z.boolean().default(false),
    paymentVelocity24h: z.number().int().min(0).max(1_000).default(0),
    deviceChange: z.boolean().default(false),
    accountTakeoverIndicators: z.boolean().default(false),
    customerVulnerability: z.boolean().default(false),
    identityVerificationResult: identityVerificationResultSchema.default('NOT_CHECKED'),
    previousWarnings: z.number().int().min(0).max(1_000).default(0),
    initiatedAt: z.string().datetime().optional(),
  })
  .strict();

export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>;

export const paymentIntentResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema,
  subjectRef: z.string(),
  correlationId: correlationIdSchema,
  recommendation: recommendationViewSchema,
  synthetic: z.boolean(),
});

export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;

export const BANK_DECISIONS = {
  ALLOWED: 'ALLOWED',
  DELAYED: 'DELAYED',
  BLOCKED: 'BLOCKED',
  CALLBACK_REQUESTED: 'CALLBACK_REQUESTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
} as const;

export type BankDecision = (typeof BANK_DECISIONS)[keyof typeof BANK_DECISIONS];

export const bankDecisionSchema = z.enum([
  BANK_DECISIONS.ALLOWED,
  BANK_DECISIONS.DELAYED,
  BANK_DECISIONS.BLOCKED,
  BANK_DECISIONS.CALLBACK_REQUESTED,
  BANK_DECISIONS.UNDER_REVIEW,
]);

export const OUTCOME_CLASSIFICATIONS = {
  PENDING: 'PENDING',
  CONFIRMED_SCAM: 'CONFIRMED_SCAM',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  LEGITIMATE: 'LEGITIMATE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type OutcomeClassification =
  (typeof OUTCOME_CLASSIFICATIONS)[keyof typeof OUTCOME_CLASSIFICATIONS];

export const outcomeClassificationSchema = z.enum([
  OUTCOME_CLASSIFICATIONS.PENDING,
  OUTCOME_CLASSIFICATIONS.CONFIRMED_SCAM,
  OUTCOME_CLASSIFICATIONS.FALSE_POSITIVE,
  OUTCOME_CLASSIFICATIONS.LEGITIMATE,
  OUTCOME_CLASSIFICATIONS.UNKNOWN,
]);

export const bankOutcomeRequestSchema = z
  .object({
    caseId: ulidSchema,
    recommendationId: ulidSchema.optional(),
    bankDecision: bankDecisionSchema,
    outcomeClassification: outcomeClassificationSchema.default(OUTCOME_CLASSIFICATIONS.PENDING),
    reference: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional(),
  })
  .strict();

export type BankOutcomeRequest = z.infer<typeof bankOutcomeRequestSchema>;

export const bankOutcomeResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema,
  caseId: ulidSchema,
  bankDecision: bankDecisionSchema,
  outcomeClassification: outcomeClassificationSchema,
  correlationId: correlationIdSchema,
  synthetic: z.boolean(),
});

export type BankOutcomeResponse = z.infer<typeof bankOutcomeResponseSchema>;

/**
 * Telecom case feedback.
 *
 * After a bank records a decision on a case, the telecom whose signal contributed sees the
 * decision and confirms what the case actually was. This is the closing half of the loop that
 * lets the network measure its own accuracy.
 */
export const TELECOM_CASE_ASSESSMENTS = {
  SCAM: 'SCAM',
  LEGITIMATE: 'LEGITIMATE',
  UNCLEAR: 'UNCLEAR',
} as const;

export type TelecomCaseAssessment =
  (typeof TELECOM_CASE_ASSESSMENTS)[keyof typeof TELECOM_CASE_ASSESSMENTS];

export const telecomCaseAssessmentSchema = z.enum([
  TELECOM_CASE_ASSESSMENTS.SCAM,
  TELECOM_CASE_ASSESSMENTS.LEGITIMATE,
  TELECOM_CASE_ASSESSMENTS.UNCLEAR,
]);

export const caseFeedbackRequestSchema = z
  .object({
    caseId: ulidSchema,
    assessment: telecomCaseAssessmentSchema,
    note: z.string().trim().max(280).optional(),
  })
  .strict();

export type CaseFeedbackRequest = z.infer<typeof caseFeedbackRequestSchema>;

export const caseFeedbackResponseSchema = z.object({
  id: ulidSchema,
  caseId: ulidSchema,
  assessment: telecomCaseAssessmentSchema,
  correlationId: correlationIdSchema,
  recordedAt: z.string().datetime(),
});

export type CaseFeedbackResponse = z.infer<typeof caseFeedbackResponseSchema>;

/** One case awaiting a telecom's assessment: their signal contributed and a bank has decided. */
export const pendingCaseFeedbackItemSchema = z.object({
  caseId: ulidSchema,
  subjectRef: z.string(),
  bankDecision: bankDecisionSchema,
  outcomeClassification: outcomeClassificationSchema,
  decidedAt: z.string().datetime(),
});

export type PendingCaseFeedbackItem = z.infer<typeof pendingCaseFeedbackItemSchema>;

export const pendingCaseFeedbackResponseSchema = z.object({
  items: z.array(pendingCaseFeedbackItemSchema),
});

export type PendingCaseFeedbackResponse = z.infer<typeof pendingCaseFeedbackResponseSchema>;
