import { z } from 'zod';
import { correlationIdSchema } from '../identifiers';
import { riskLevelSchema, recommendationActionSchema } from './decision';

/**
 * Read models for the Operations Console. These are dedicated projections, not raw table
 * dumps (a deliberate boundary from slide 043): the console reads a shape designed for it,
 * so the storage layer can change underneath without breaking the UI.
 *
 * Every counter that is a synthetic demo figure is labelled as such, so nobody mistakes a
 * simulated total for a validated business-outcome metric.
 */

/** Health rollup for a single dependency or provider. */
export const PROVIDER_HEALTH_STATES = {
  CONNECTED: 'CONNECTED',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
} as const;

export type ProviderHealthState =
  (typeof PROVIDER_HEALTH_STATES)[keyof typeof PROVIDER_HEALTH_STATES];

export const providerHealthStateSchema = z.enum([
  PROVIDER_HEALTH_STATES.CONNECTED,
  PROVIDER_HEALTH_STATES.DEGRADED,
  PROVIDER_HEALTH_STATES.UNAVAILABLE,
  PROVIDER_HEALTH_STATES.NOT_CONFIGURED,
]);

export const providerHealthSchema = z.object({
  name: z.string(),
  kind: z.enum(['DATABASE', 'CACHE', 'QUEUE', 'NOTIFICATION', 'RISK_SIGNAL', 'AUTH', 'STORAGE', 'AI']),
  state: providerHealthStateSchema,
  /** Which implementation is wired: an in-memory dev adapter or a real provider. */
  implementation: z.string(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastFailureAt: z.string().datetime().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
});

export type ProviderHealth = z.infer<typeof providerHealthSchema>;

/** Distinguishes a real measured figure from a synthetic demo counter in the UI. */
export const metricOriginSchema = z.enum(['MEASURED', 'SYNTHETIC']);
export type MetricOrigin = z.infer<typeof metricOriginSchema>;

export const operationsSummarySchema = z.object({
  environment: z.string(),
  providerMode: z.enum(['in-memory', 'real', 'mixed']),
  generatedAt: z.string().datetime(),

  /** Ingestion + correlation counters, measured from the in-process store this session. */
  volume: z.object({
    origin: metricOriginSchema,
    riskEventsReceived: z.number().int().nonnegative(),
    paymentIntentsReceived: z.number().int().nonnegative(),
    correlatedCases: z.number().int().nonnegative(),
    warningsIssued: z.number().int().nonnegative(),
    paymentsDelayed: z.number().int().nonnegative(),
    callbackRecommendations: z.number().int().nonnegative(),
    analystReviewRecommendations: z.number().int().nonnegative(),
    blockRecommendations: z.number().int().nonnegative(),
  }),

  /** Case counts by severity, measured from this session's evaluations. */
  caseSeverity: z.object({
    origin: metricOriginSchema,
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  }),

  /**
   * Outcome figures. These are SYNTHETIC in Version 1a: there is no bank feedback loop yet,
   * so confirmed-scam / false-positive counts are seeded demo values, never business truth.
   */
  outcomes: z.object({
    origin: metricOriginSchema,
    confirmedScams: z.number().int().nonnegative(),
    falsePositives: z.number().int().nonnegative(),
  }),

  api: z.object({
    origin: metricOriginSchema,
    requestsHandled: z.number().int().nonnegative(),
    p50LatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
    failedRequests: z.number().int().nonnegative(),
  }),

  queue: z.object({
    origin: metricOriginSchema,
    depth: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative(),
    note: z.string(),
  }),

  providers: z.array(providerHealthSchema),
});

export type OperationsSummary = z.infer<typeof operationsSummarySchema>;

/** Event categories surfaced in the live stream. */
export const OPERATIONAL_EVENT_TYPES = {
  TELECOM_RISK_EVENT: 'telecom.risk_event.received',
  PAYMENT_INTENT: 'payment.intent.received',
  CORRELATION: 'correlation.matched',
  RISK_ASSESSMENT: 'risk.assessment.completed',
  DECISION_RECOMMENDATION: 'decision.recommendation.issued',
  BANK_OUTCOME: 'bank.outcome.recorded',
  NOTIFICATION: 'notification.dispatched',
  AUDIT: 'audit.event.recorded',
  QUEUE_FAILURE: 'queue.job.failed',
} as const;

export type OperationalEventType =
  (typeof OPERATIONAL_EVENT_TYPES)[keyof typeof OPERATIONAL_EVENT_TYPES];

export const operationalEventTypeSchema = z.enum([
  OPERATIONAL_EVENT_TYPES.TELECOM_RISK_EVENT,
  OPERATIONAL_EVENT_TYPES.PAYMENT_INTENT,
  OPERATIONAL_EVENT_TYPES.CORRELATION,
  OPERATIONAL_EVENT_TYPES.RISK_ASSESSMENT,
  OPERATIONAL_EVENT_TYPES.DECISION_RECOMMENDATION,
  OPERATIONAL_EVENT_TYPES.BANK_OUTCOME,
  OPERATIONAL_EVENT_TYPES.NOTIFICATION,
  OPERATIONAL_EVENT_TYPES.AUDIT,
  OPERATIONAL_EVENT_TYPES.QUEUE_FAILURE,
]);

export const EVENT_SEVERITIES = {
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type EventSeverity = (typeof EVENT_SEVERITIES)[keyof typeof EVENT_SEVERITIES];

export const eventSeveritySchema = z.enum([
  EVENT_SEVERITIES.INFO,
  EVENT_SEVERITIES.LOW,
  EVENT_SEVERITIES.MEDIUM,
  EVENT_SEVERITIES.HIGH,
  EVENT_SEVERITIES.CRITICAL,
]);

export const EVENT_STATUSES = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
} as const;

export type EventStatus = (typeof EVENT_STATUSES)[keyof typeof EVENT_STATUSES];

export const eventStatusSchema = z.enum([
  EVENT_STATUSES.RECEIVED,
  EVENT_STATUSES.PROCESSING,
  EVENT_STATUSES.COMPLETED,
  EVENT_STATUSES.FAILED,
  EVENT_STATUSES.RETRYING,
]);

/**
 * One row in the live event stream. The payload preview is already redacted server-side;
 * it never contains secrets, credentials, or raw identifiers.
 */
export const operationalEventSchema = z.object({
  id: z.string(),
  type: operationalEventTypeSchema,
  occurredAt: z.string().datetime(),
  correlationId: correlationIdSchema,
  /** Tenant or partner label, safe to display. */
  actor: z.string(),
  /** Opaque pairwise reference; never a raw phone or account number. */
  subjectRef: z.string().nullable(),
  severity: eventSeveritySchema,
  status: eventStatusSchema,
  attempt: z.number().int().positive(),
  provider: z.string(),
  durationMs: z.number().nonnegative().nullable(),
  synthetic: z.boolean(),
  /** Redacted, truncated summary of the payload. Safe to render. */
  payloadPreview: z.record(z.unknown()),
});

export type OperationalEvent = z.infer<typeof operationalEventSchema>;

export const eventListQuerySchema = z.object({
  type: operationalEventTypeSchema.optional(),
  severity: eventSeveritySchema.optional(),
  status: eventStatusSchema.optional(),
  provider: z.string().optional(),
  actor: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventListSchema = z.object({
  items: z.array(operationalEventSchema),
  nextCursor: z.string().optional(),
});

export type EventList = z.infer<typeof eventListSchema>;

/** The stages of the end-to-end flow, in order (slide 026 pipeline). */
export const FLOW_STAGES = {
  TELECOM_EVENT: 'TELECOM_EVENT',
  EVENT_VALIDATION: 'EVENT_VALIDATION',
  CONSENT_CHECK: 'CONSENT_CHECK',
  CORRELATION: 'CORRELATION',
  PAYMENT_INTENT: 'PAYMENT_INTENT',
  RISK_EVALUATION: 'RISK_EVALUATION',
  RULES_AND_POLICY: 'RULES_AND_POLICY',
  RECOMMENDATION: 'RECOMMENDATION',
  BANK_DECISION: 'BANK_DECISION',
  OUTCOME: 'OUTCOME',
  CONTINUOUS_LEARNING: 'CONTINUOUS_LEARNING',
} as const;

export type FlowStageId = (typeof FLOW_STAGES)[keyof typeof FLOW_STAGES];

export const flowStageIdSchema = z.enum([
  FLOW_STAGES.TELECOM_EVENT,
  FLOW_STAGES.EVENT_VALIDATION,
  FLOW_STAGES.CONSENT_CHECK,
  FLOW_STAGES.CORRELATION,
  FLOW_STAGES.PAYMENT_INTENT,
  FLOW_STAGES.RISK_EVALUATION,
  FLOW_STAGES.RULES_AND_POLICY,
  FLOW_STAGES.RECOMMENDATION,
  FLOW_STAGES.BANK_DECISION,
  FLOW_STAGES.OUTCOME,
  FLOW_STAGES.CONTINUOUS_LEARNING,
]);

export const FLOW_STAGE_STATUSES = {
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
} as const;

export type FlowStageStatus =
  (typeof FLOW_STAGE_STATUSES)[keyof typeof FLOW_STAGE_STATUSES];

export const flowStageStatusSchema = z.enum([
  FLOW_STAGE_STATUSES.COMPLETED,
  FLOW_STAGE_STATUSES.SKIPPED,
  FLOW_STAGE_STATUSES.PENDING,
  FLOW_STAGE_STATUSES.FAILED,
]);

/** One executed (or pending) stage in a synthetic journey, for the flow visualization. */
export const flowStageResultSchema = z.object({
  stage: flowStageIdSchema,
  label: z.string(),
  /** Module or service responsible for the stage. */
  module: z.string(),
  status: flowStageStatusSchema,
  durationMs: z.number().nonnegative().nullable(),
  correlationId: correlationIdSchema,
  inputSummary: z.string(),
  outputSummary: z.string(),
  /** How this stage behaves on failure (documented, not necessarily exercised). */
  failureBehavior: z.string(),
  relatedAuditEventId: z.string().nullable(),
});

export type FlowStageResult = z.infer<typeof flowStageResultSchema>;

export const flowRunSchema = z.object({
  correlationId: correlationIdSchema,
  decisionId: z.string(),
  startedAt: z.string().datetime(),
  stages: z.array(flowStageResultSchema),
});

export type FlowRun = z.infer<typeof flowRunSchema>;

/** Development progress read model, drawn from build metadata where available. */
export const developmentStatusSchema = z.object({
  version: z.string(),
  commit: z.string(),
  environment: z.string(),
  providerMode: z.string(),
  currentMilestone: z.string(),
  nextMilestone: z.string(),
  /** Latest recorded verification snapshot; clearly a recorded figure, not a live claim. */
  verification: z.object({
    recordedAt: z.string().datetime().nullable(),
    unitTests: z.number().int().nonnegative().nullable(),
    note: z.string(),
  }),
  capabilities: z.array(
    z.object({
      name: z.string(),
      state: z.enum(['IMPLEMENTED', 'SIMULATED', 'PLANNED']),
      detail: z.string(),
    }),
  ),
  migrations: z.object({
    state: z.enum(['UP_TO_DATE', 'PENDING', 'UNKNOWN', 'NOT_APPLICABLE']),
    detail: z.string(),
  }),
});

export type DevelopmentStatus = z.infer<typeof developmentStatusSchema>;

/** A recommendation summary as stored for the case list. */
export const decisionListItemSchema = z.object({
  decisionId: z.string(),
  correlationId: correlationIdSchema,
  subjectRef: z.string(),
  organizationId: z.string(),
  riskScore: z.number(),
  riskLevel: riskLevelSchema,
  recommendedAction: recommendationActionSchema,
  evaluatedAt: z.string().datetime(),
  synthetic: z.boolean(),
});

export type DecisionListItem = z.infer<typeof decisionListItemSchema>;

export const decisionListSchema = z.object({
  items: z.array(decisionListItemSchema),
  nextCursor: z.string().optional(),
});

export type DecisionList = z.infer<typeof decisionListSchema>;
