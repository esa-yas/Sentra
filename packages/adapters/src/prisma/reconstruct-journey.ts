import { AUTHORITY_NOTE } from '@sentra/core';
import {
  FLOW_STAGE_STATUSES,
  FLOW_STAGES,
  type AuditEventSummary,
  type FlowRun,
  type FlowStageResult,
  type OperationalEvent,
  type RecommendationAction,
  type RecommendationView,
  type RiskLevel,
} from '@sentra/contracts';
import type { Prisma } from '@sentra/db';

export const jsonObject = (value: Prisma.JsonValue | null): Record<string, unknown> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const jsonArray = <T>(value: Prisma.JsonValue | null): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

type RecommendationRow = {
  id: string;
  organizationId: string;
  subjectRef: string;
  recommendedAction: RecommendationAction;
  alternativeActions: RecommendationAction[];
  riskScore: number;
  riskLevel: RiskLevel;
  uncertainty: Prisma.Decimal;
  reasonCodes: string[];
  summary: string;
  authorityNote: string;
  policyVersion: string;
  rulesVersion: string;
  modelVersion: string | null;
  issuedAt: Date;
  correlationId: string;
  source: string;
};

type AssessmentRow = {
  contributingSignals: Prisma.JsonValue;
  rulesTriggered: string[];
  evidenceSources: Prisma.JsonValue;
  missingProviders: string[];
  processingTimeMs: number;
  evaluatedAt: Date;
};

type OperationalRow = {
  id: string;
  organizationId: string | null;
  type: string;
  severity: OperationalEvent['severity'];
  status: OperationalEvent['status'];
  actor: string;
  subjectRef: string | null;
  provider: string;
  attempt: number;
  durationMs: number | null;
  synthetic: boolean;
  payloadPreview: Prisma.JsonValue;
  correlationId: string;
  occurredAt: Date;
};

type AuditRow = {
  id: string;
  action: string;
  chainKey: string;
  sequence: bigint;
  hashPrev: string;
  hashSelf: string;
  occurredAt: Date;
};

export const toOperationalEvent = (row: OperationalRow): OperationalEvent => ({
  id: row.id,
  type: row.type as OperationalEvent['type'],
  occurredAt: row.occurredAt.toISOString(),
  correlationId: row.correlationId,
  actor: row.actor,
  subjectRef: row.subjectRef ?? null,
  severity: row.severity,
  status: row.status,
  attempt: row.attempt,
  provider: row.provider,
  durationMs: row.durationMs ?? null,
  synthetic: row.synthetic,
  payloadPreview: jsonObject(row.payloadPreview),
});

export const toRecommendationView = (
  recommendation: RecommendationRow,
  assessment: AssessmentRow | null,
  auditEvents: readonly AuditRow[],
): RecommendationView => ({
  decisionId: recommendation.id,
  correlationId: recommendation.correlationId,
  subjectRef: recommendation.subjectRef,
  organizationId: recommendation.organizationId,
  riskScore: recommendation.riskScore,
  riskLevel: recommendation.riskLevel,
  uncertainty: Number(recommendation.uncertainty),
  recommendedAction: recommendation.recommendedAction,
  alternativeActions: [...recommendation.alternativeActions],
  reasonCodes: [...recommendation.reasonCodes] as RecommendationView['reasonCodes'],
  contributingSignals: jsonArray(assessment?.contributingSignals ?? null) as RecommendationView['contributingSignals'],
  rulesTriggered: [...(assessment?.rulesTriggered ?? [])],
  evidenceSources: jsonArray(assessment?.evidenceSources ?? null) as RecommendationView['evidenceSources'],
  missingProviders: [...(assessment?.missingProviders ?? [])],
  policyVersion: recommendation.policyVersion,
  rulesVersion: recommendation.rulesVersion,
  modelVersion: recommendation.modelVersion,
  processingTimeMs: assessment?.processingTimeMs ?? 0,
  evaluatedAt: (assessment?.evaluatedAt ?? recommendation.issuedAt).toISOString(),
  summary: recommendation.summary,
  authorityNote: recommendation.authorityNote || AUTHORITY_NOTE,
  auditEvents: auditEvents.map(
    (event): AuditEventSummary => ({
      id: event.id,
      action: event.action,
      chainKey: event.chainKey,
      sequence: event.sequence.toString(),
      hashPrev: event.hashPrev,
      hashSelf: event.hashSelf,
      occurredAt: event.occurredAt.toISOString(),
    }),
  ),
  synthetic: recommendation.source === 'seed' || recommendation.source === 'evaluate',
});

const stage = (
  id: FlowStageResult['stage'],
  label: string,
  module: string,
  status: FlowStageResult['status'],
  correlationId: string,
  inputSummary: string,
  outputSummary: string,
  relatedAuditEventId: string | null,
  durationMs: number | null = 1,
): FlowStageResult => ({
  stage: id,
  label,
  module,
  status,
  durationMs,
  correlationId,
  inputSummary,
  outputSummary,
  failureBehavior: 'See case timeline.',
  relatedAuditEventId,
});

export const reconstructFlow = (input: {
  readonly correlationId: string;
  readonly decisionId: string;
  readonly startedAt: Date;
  readonly recommendation: RecommendationRow;
  readonly events: readonly OperationalEvent[];
  readonly auditEvents: readonly AuditRow[];
  readonly hasBankOutcome: boolean;
}): FlowRun => {
  const auditId = (action: string): string | null =>
    input.auditEvents.find((event) => event.action === action)?.id ?? null;
  const hasType = (type: string): boolean => input.events.some((event) => event.type === type);
  const completed = FLOW_STAGE_STATUSES.COMPLETED;
  const pending = FLOW_STAGE_STATUSES.PENDING;
  const cid = input.correlationId;

  const stages: FlowStageResult[] = [
    stage(
      FLOW_STAGES.TELECOM_EVENT,
      'Telecom Event',
      'ingest/telecom-risk-event',
      hasType('telecom.risk_event.received') ? completed : pending,
      cid,
      'Persisted telecom risk event',
      hasType('telecom.risk_event.received') ? 'Signal stored' : 'No telecom row for this correlation',
      auditId('telecom_signal.received'),
    ),
    stage(
      FLOW_STAGES.EVENT_VALIDATION,
      'Event Validation',
      'edge/validation + deny-list',
      completed,
      cid,
      'Persisted request',
      'Accepted',
      null,
    ),
    stage(
      FLOW_STAGES.CONSENT_CHECK,
      'Consent Check',
      'core/consent',
      completed,
      cid,
      'consent_records lookup',
      'Consent resolved from PostgreSQL',
      null,
    ),
    stage(
      FLOW_STAGES.CORRELATION,
      'Correlation',
      'core/correlation',
      hasType('correlation.matched') ? completed : completed,
      cid,
      'subjectRef + purpose + time window',
      'Case correlated',
      auditId('correlation.matched'),
    ),
    stage(
      FLOW_STAGES.PAYMENT_INTENT,
      'Payment Intent',
      'ingest/payment-intent',
      hasType('payment.intent.received') ? completed : pending,
      cid,
      'Persisted payment intent',
      'Intent stored',
      auditId('payment_intent.received'),
    ),
    stage(
      FLOW_STAGES.RISK_EVALUATION,
      'Risk Evaluation',
      'core/decision/risk-engine',
      completed,
      cid,
      'Governed evidence',
      `Score ${input.recommendation.riskScore} (${input.recommendation.riskLevel})`,
      auditId('risk_assessment.completed'),
    ),
    stage(
      FLOW_STAGES.RULES_AND_POLICY,
      'Rules & Policy',
      'core/decision/policy',
      completed,
      cid,
      `Level ${input.recommendation.riskLevel}`,
      input.recommendation.rulesVersion,
      null,
    ),
    stage(
      FLOW_STAGES.RECOMMENDATION,
      'Recommendation',
      'core/decision',
      completed,
      cid,
      'Score + policy',
      `${input.recommendation.recommendedAction} (advisory)`,
      auditId('recommendation.issued'),
    ),
    stage(
      FLOW_STAGES.BANK_DECISION,
      'Bank Decision',
      'partner/bank (external)',
      input.hasBankOutcome ? completed : pending,
      cid,
      'Recommendation delivered',
      input.hasBankOutcome ? 'Bank outcome recorded' : 'Awaiting the bank’s final decision',
      null,
      input.hasBankOutcome ? 1 : null,
    ),
    stage(
      FLOW_STAGES.OUTCOME,
      'Outcome',
      'partner/bank (external)',
      input.hasBankOutcome ? completed : pending,
      cid,
      'Bank action',
      input.hasBankOutcome ? 'Outcome stored' : 'Outcome submission not yet implemented',
      null,
      input.hasBankOutcome ? 1 : null,
    ),
    stage(
      FLOW_STAGES.CONTINUOUS_LEARNING,
      'Continuous Learning',
      'analytics (off-path)',
      pending,
      cid,
      'Decisions + outcomes',
      'Off critical path',
      null,
      null,
    ),
  ];

  return {
    correlationId: cid,
    decisionId: input.decisionId,
    startedAt: input.startedAt.toISOString(),
    stages,
  };
};
