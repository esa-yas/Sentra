import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  EVENT_SEVERITIES,
  EVENT_STATUSES,
  EVIDENCE_AVAILABILITY,
  FLOW_STAGES,
  FLOW_STAGE_STATUSES,
  OPERATIONAL_EVENT_TYPES,
  PURPOSES,
  type AuditEventSummary,
  type EventSeverity,
  type FlowStageResult,
  type FlowRun,
  type OperationalEvent,
  type RecommendationView,
  type RiskLevel,
  type SimulatorEvaluateRequest,
} from '@sentra/contracts';
import type {
  AuditProvider,
  AuditRecordInput,
  Clock,
  DecisionPersistence,
  IdGenerator,
  RecordedAuditEvent,
  UnitOfWork,
} from '@sentra/ports';
import { CONSENT_LOOKUP_STATUSES, type ConsentLookupStatus } from '@sentra/ports';
import { evaluateScamRisk, type RiskAssessment } from './risk-engine';

/**
 * The synchronous decision use case: it turns a validated payment/telecom picture into an
 * explainable recommendation, records the decision on the tenant's audit chain inside one
 * transaction (slide 034), and returns the console-ready read models.
 *
 * It depends only on ports — no Prisma, no queue, no HTTP — so the same use case runs
 * against in-memory adapters today and Postgres tomorrow with no change (slide 048).
 */
export interface EvaluatePaymentRiskDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly audit: AuditProvider;
  readonly unitOfWork: UnitOfWork;
  /** When set, the journey is persisted atomically (Slice 2 real mode). */
  readonly persistence?: DecisionPersistence;
}

export interface EvaluatePaymentRiskContext {
  readonly correlationId: string;
  readonly actorLabel?: string;
  readonly organizationId?: string;
  readonly subjectRef?: string;
}

export interface EvaluatePaymentRiskOutput {
  readonly recommendation: RecommendationView;
  readonly events: readonly OperationalEvent[];
  readonly flow: FlowRun;
  readonly assessment: RiskAssessment;
}

const SYNTHETIC = true;

const levelToSeverity: Record<RiskLevel, EventSeverity> = {
  LOW: EVENT_SEVERITIES.LOW,
  MEDIUM: EVENT_SEVERITIES.MEDIUM,
  HIGH: EVENT_SEVERITIES.HIGH,
  CRITICAL: EVENT_SEVERITIES.CRITICAL,
};

export const createEvaluatePaymentRiskUseCase = (deps: EvaluatePaymentRiskDeps) => {
  const { clock, ids, audit, unitOfWork, persistence } = deps;

  const execute = async (
    input: SimulatorEvaluateRequest,
    context: EvaluatePaymentRiskContext,
  ): Promise<EvaluatePaymentRiskOutput> => {
    const startedMonotonic = clock.monotonicMs();
    const startedAt = clock.now();

    const correlationId = input.correlationId ?? context.correlationId;
    const organizationId = context.organizationId ?? input.organizationId ?? ids.generate();
    const subjectRef = context.subjectRef ?? input.subjectRef ?? `sbj_${ids.generate()}`;
    const actorLabel = context.actorLabel ?? 'partner:bank-sandbox';
    const decisionId = ids.generate();

    return unitOfWork.run(async (scope) => {
      if (persistence !== undefined) {
        const existing = await persistence.findByCorrelation(scope, organizationId, correlationId);
        if (existing !== null) {
          return {
            recommendation: existing.recommendation,
            events: existing.events,
            flow: existing.flow,
            assessment: evaluateScamRisk(input),
          };
        }
      }

      let consentStatus: ConsentLookupStatus = CONSENT_LOOKUP_STATUSES.GRANTED;
      let effectiveInput = input;

      if (persistence !== undefined) {
        const lookedUp = await persistence.lookupConsent(scope, {
          organizationId,
          subjectRef,
          purpose: PURPOSES.PROTECT_PAYMENT,
          now: clock.now(),
        });
        consentStatus = lookedUp.status;
        if (consentStatus !== CONSENT_LOOKUP_STATUSES.GRANTED) {
          const evidence =
            consentStatus === CONSENT_LOOKUP_STATUSES.UNAVAILABLE
              ? EVIDENCE_AVAILABILITY.UNAVAILABLE
              : EVIDENCE_AVAILABILITY.NO_CONSENT;
          effectiveInput = { ...input, telecomEvidence: evidence };
        }
      }

      const telecomUsable =
        effectiveInput.telecomEvidence === EVIDENCE_AVAILABILITY.OK ||
        effectiveInput.telecomEvidence === EVIDENCE_AVAILABILITY.OK_NO_SIGNALS;

      const engineStart = clock.monotonicMs();
      const assessment = evaluateScamRisk(effectiveInput);
      const engineDurationMs = Math.max(0, clock.monotonicMs() - engineStart);

      const recordedAudits: RecordedAuditEvent[] = [];
      const auditByAction = new Map<string, RecordedAuditEvent>();

      const record = async (
        partial: Omit<AuditRecordInput, 'organizationId' | 'purpose' | 'occurredAt' | 'actorType' | 'actorLabel'>,
      ): Promise<RecordedAuditEvent> => {
        const recorded = await audit.record(
          {
            organizationId,
            actorType: ACTOR_TYPES.PARTNER,
            actorLabel,
            purpose: PURPOSES.PROTECT_PAYMENT,
            outcome: AUDIT_OUTCOMES.ALLOWED,
            occurredAt: clock.now(),
            correlationId,
            ...partial,
          },
          scope,
        );
        recordedAudits.push(recorded);
        auditByAction.set(partial.action, recorded);
        return recorded;
      };

      if (telecomUsable) {
        await record({
          action: 'telecom_signal.received',
          resourceType: 'telecom_signal',
          resourceId: decisionId,
          metadata: {
            recentSuspiciousCall: effectiveInput.recentSuspiciousCall,
            callerReputation: effectiveInput.callerReputation,
            telecomEvidence: effectiveInput.telecomEvidence,
          },
        });
      }
      await record({
        action: 'payment_intent.received',
        resourceType: 'payment_intent',
        resourceId: decisionId,
        metadata: {
          amount: effectiveInput.paymentAmount,
          currency: effectiveInput.currency,
          firstTimePayee: effectiveInput.firstTimePayee,
        },
      });
      await record({
        action: 'correlation.matched',
        resourceType: 'protection_session',
        resourceId: decisionId,
        metadata: { subjectRef, telecomEvidence: effectiveInput.telecomEvidence, consentStatus },
      });
      await record({
        action: 'risk_assessment.completed',
        resourceType: 'risk_assessment',
        resourceId: decisionId,
        metadata: {
          riskScore: assessment.riskScore,
          riskLevel: assessment.riskLevel,
          uncertainty: assessment.uncertainty,
          reasonCodes: [...assessment.reasonCodes],
        },
      });
      await record({
        action: 'recommendation.issued',
        resourceType: 'recommendation',
        resourceId: decisionId,
        metadata: {
          recommendedAction: assessment.recommendedAction,
          policyVersion: assessment.policyVersion,
          rulesVersion: assessment.rulesVersion,
        },
      });

      const auditSummaries: AuditEventSummary[] = recordedAudits.map((recorded, index) => ({
        id: recorded.id,
        action: [...auditByAction.entries()].find(([, value]) => value === recorded)?.[0] ?? `audit.${index}`,
        chainKey: recorded.chainKey,
        sequence: recorded.sequence.toString(),
        hashPrev: recorded.hashPrev,
        hashSelf: recorded.hashSelf,
        occurredAt: recorded.occurredAt.toISOString(),
      }));

      const processingTimeMs = Math.max(engineDurationMs, clock.monotonicMs() - startedMonotonic);
      const evaluatedAtIso = clock.now().toISOString();

      const recommendation: RecommendationView = {
        decisionId,
        correlationId,
        subjectRef,
        organizationId,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        uncertainty: assessment.uncertainty,
        recommendedAction: assessment.recommendedAction,
        alternativeActions: [...assessment.alternativeActions],
        reasonCodes: [...assessment.reasonCodes],
        contributingSignals: [...assessment.contributingSignals],
        rulesTriggered: [...assessment.rulesTriggered],
        evidenceSources: [...assessment.evidenceSources],
        missingProviders: [...assessment.missingProviders],
        policyVersion: assessment.policyVersion,
        rulesVersion: assessment.rulesVersion,
        modelVersion: null,
        processingTimeMs,
        evaluatedAt: evaluatedAtIso,
        summary: assessment.summary,
        authorityNote:
          'This is an advisory recommendation. The bank retains final authority over the payment decision.',
        auditEvents: auditSummaries,
        synthetic: SYNTHETIC,
      };

      const events = buildEvents({
        ids,
        correlationId,
        actorLabel,
        subjectRef,
        input: effectiveInput,
        assessment,
        evaluatedAtIso,
        engineDurationMs,
        telecomUsable,
      });

      const flow = buildFlow({
        correlationId,
        decisionId,
        startedAtIso: startedAt.toISOString(),
        input: effectiveInput,
        assessment,
        engineDurationMs,
        telecomUsable,
        auditByAction,
        consentStatus,
      });

      if (persistence !== undefined) {
        await persistence.persistJourney(scope, {
          organizationId,
          subjectRef,
          correlationId,
          actorLabel,
          input: effectiveInput,
          recommendation,
          events,
          flow,
          telecomUsable,
          consentStatus,
          now: clock.now(),
        });
      }

      return { recommendation, events, flow, assessment };
    });
  };

  return { execute };
};

export type EvaluatePaymentRiskUseCase = ReturnType<typeof createEvaluatePaymentRiskUseCase>;

interface BuildEventsArgs {
  readonly ids: IdGenerator;
  readonly correlationId: string;
  readonly actorLabel: string;
  readonly subjectRef: string;
  readonly input: SimulatorEvaluateRequest;
  readonly assessment: RiskAssessment;
  readonly evaluatedAtIso: string;
  readonly engineDurationMs: number;
  readonly telecomUsable: boolean;
}

const buildEvents = (args: BuildEventsArgs): OperationalEvent[] => {
  const { ids, correlationId, actorLabel, subjectRef, input, assessment, evaluatedAtIso } = args;
  const severity = levelToSeverity[assessment.riskLevel];

  const events: OperationalEvent[] = [];

  if (args.telecomUsable) {
    events.push({
      id: ids.generate(),
      type: OPERATIONAL_EVENT_TYPES.TELECOM_RISK_EVENT,
      occurredAt: evaluatedAtIso,
      correlationId,
      actor: 'telecom:operator-sandbox',
      subjectRef,
      severity: input.recentSuspiciousCall ? EVENT_SEVERITIES.HIGH : EVENT_SEVERITIES.INFO,
      status: EVENT_STATUSES.COMPLETED,
      attempt: 1,
      provider: 'in-memory-risk-signals',
      durationMs: 1,
      synthetic: SYNTHETIC,
      payloadPreview: {
        recentSuspiciousCall: input.recentSuspiciousCall,
        callerReputation: input.callerReputation,
        telecomEvidence: input.telecomEvidence,
      },
    });
  }

  events.push({
    id: ids.generate(),
    type: OPERATIONAL_EVENT_TYPES.PAYMENT_INTENT,
    occurredAt: evaluatedAtIso,
    correlationId,
    actor: actorLabel,
    subjectRef,
    severity: EVENT_SEVERITIES.INFO,
    status: EVENT_STATUSES.COMPLETED,
    attempt: 1,
    provider: 'in-memory-store',
    durationMs: 1,
    synthetic: SYNTHETIC,
    payloadPreview: {
      amount: input.paymentAmount,
      currency: input.currency,
      firstTimePayee: input.firstTimePayee,
      payeeAgeDays: input.payeeAgeDays,
    },
  });

  events.push({
    id: ids.generate(),
    type: OPERATIONAL_EVENT_TYPES.CORRELATION,
    occurredAt: evaluatedAtIso,
    correlationId,
    actor: 'sentra:correlation',
    subjectRef,
    severity: EVENT_SEVERITIES.INFO,
    status: EVENT_STATUSES.COMPLETED,
    attempt: 1,
    provider: 'core',
    durationMs: 1,
    synthetic: SYNTHETIC,
    payloadPreview: { telecomEvidence: input.telecomEvidence },
  });

  events.push({
    id: ids.generate(),
    type: OPERATIONAL_EVENT_TYPES.RISK_ASSESSMENT,
    occurredAt: evaluatedAtIso,
    correlationId,
    actor: 'sentra:risk-engine',
    subjectRef,
    severity,
    status: EVENT_STATUSES.COMPLETED,
    attempt: 1,
    provider: 'core',
    durationMs: Math.max(1, Math.round(args.engineDurationMs)),
    synthetic: SYNTHETIC,
    payloadPreview: {
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      uncertainty: assessment.uncertainty,
    },
  });

  events.push({
    id: ids.generate(),
    type: OPERATIONAL_EVENT_TYPES.DECISION_RECOMMENDATION,
    occurredAt: evaluatedAtIso,
    correlationId,
    actor: 'sentra:policy',
    subjectRef,
    severity,
    status: EVENT_STATUSES.COMPLETED,
    attempt: 1,
    provider: 'core',
    durationMs: 1,
    synthetic: SYNTHETIC,
    payloadPreview: {
      recommendedAction: assessment.recommendedAction,
      reasonCodes: [...assessment.reasonCodes].slice(0, 5),
    },
  });

  return events;
};

interface BuildFlowArgs {
  readonly correlationId: string;
  readonly decisionId: string;
  readonly startedAtIso: string;
  readonly input: SimulatorEvaluateRequest;
  readonly assessment: RiskAssessment;
  readonly engineDurationMs: number;
  readonly telecomUsable: boolean;
  readonly auditByAction: Map<string, RecordedAuditEvent>;
  readonly consentStatus: ConsentLookupStatus;
}

const buildFlow = (args: BuildFlowArgs): FlowRun => {
  const { correlationId, decisionId, input, assessment, auditByAction } = args;
  const auditId = (action: string): string | null => auditByAction.get(action)?.id ?? null;

  const consentUsable = args.telecomUsable;
  const consentStatus = args.consentStatus !== CONSENT_LOOKUP_STATUSES.GRANTED
    ? FLOW_STAGE_STATUSES.SKIPPED
    : consentUsable
      ? FLOW_STAGE_STATUSES.COMPLETED
      : input.telecomEvidence === EVIDENCE_AVAILABILITY.NO_CONSENT
        ? FLOW_STAGE_STATUSES.SKIPPED
        : FLOW_STAGE_STATUSES.COMPLETED;

  const stages: FlowStageResult[] = [
    {
      stage: FLOW_STAGES.TELECOM_EVENT,
      label: 'Telecom Event',
      module: 'ingest/telecom-risk-event',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: `Telecom evidence: ${input.telecomEvidence}`,
      outputSummary: consentUsable
        ? `Suspicious call: ${input.recentSuspiciousCall}, reputation ${input.callerReputation}`
        : 'No usable telecom signal for this subject',
      failureBehavior: 'Reject malformed events; unavailable feed is treated fail-neutral downstream.',
      relatedAuditEventId: auditId('telecom_signal.received'),
    },
    {
      stage: FLOW_STAGES.EVENT_VALIDATION,
      label: 'Event Validation',
      module: 'edge/validation + deny-list',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: 'Raw request body',
      outputSummary: 'Schema valid; no forbidden fields present',
      failureBehavior: '422 on invalid schema; 400 forbidden_field on prohibited data.',
      relatedAuditEventId: null,
    },
    {
      stage: FLOW_STAGES.CONSENT_CHECK,
      label: 'Consent Check',
      module: 'core/consent',
      status: consentStatus,
      durationMs: 1,
      correlationId,
      inputSummary: `Telecom evidence: ${input.telecomEvidence}`,
      outputSummary:
        args.consentStatus !== CONSENT_LOOKUP_STATUSES.GRANTED
          ? `Consent ${args.consentStatus}; telecom signals not used as granted evidence`
          : consentStatus === FLOW_STAGE_STATUSES.SKIPPED
            ? 'No consent covers this subject; telecom signals not used'
            : 'Consent present or not required for payment-only evidence',
      failureBehavior: 'NO_CONSENT proceeds without telecom evidence; never blocks the decision.',
      relatedAuditEventId: null,
    },
    {
      stage: FLOW_STAGES.CORRELATION,
      label: 'Correlation',
      module: 'core/correlation',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: 'Telecom signal + payment intent',
      outputSummary: `Correlated into one protection session (${decisionId})`,
      failureBehavior: 'Unmatched signals expire with their consent window.',
      relatedAuditEventId: auditId('correlation.matched'),
    },
    {
      stage: FLOW_STAGES.PAYMENT_INTENT,
      label: 'Payment Intent',
      module: 'ingest/payment-intent',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: `${input.currency} ${input.paymentAmount}, first-time payee: ${input.firstTimePayee}`,
      outputSummary: 'Payment intent accepted for assessment',
      failureBehavior: 'Card/account data is refused by the deny-list before this stage.',
      relatedAuditEventId: auditId('payment_intent.received'),
    },
    {
      stage: FLOW_STAGES.RISK_EVALUATION,
      label: 'Risk Evaluation',
      module: 'core/decision/risk-engine',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: Math.max(1, Math.round(args.engineDurationMs)),
      correlationId,
      inputSummary: 'Governed evidence + weights',
      outputSummary: `Score ${assessment.riskScore} (${assessment.riskLevel}), uncertainty ${assessment.uncertainty}`,
      failureBehavior: 'Deterministic; on missing evidence raises uncertainty, never lowers score.',
      relatedAuditEventId: auditId('risk_assessment.completed'),
    },
    {
      stage: FLOW_STAGES.RULES_AND_POLICY,
      label: 'Rules & Policy',
      module: 'core/decision/policy',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: `Level ${assessment.riskLevel}, uncertainty ${assessment.uncertainty}`,
      outputSummary: `Rules: ${assessment.rulesTriggered.join(', ')}`,
      failureBehavior: 'Policy is versioned; action-escalating changes require approval.',
      relatedAuditEventId: null,
    },
    {
      stage: FLOW_STAGES.RECOMMENDATION,
      label: 'Recommendation',
      module: 'core/decision',
      status: FLOW_STAGE_STATUSES.COMPLETED,
      durationMs: 1,
      correlationId,
      inputSummary: 'Score + policy',
      outputSummary: `${assessment.recommendedAction} (advisory)`,
      failureBehavior: 'Explainable and reproducible from its versions.',
      relatedAuditEventId: auditId('recommendation.issued'),
    },
    {
      stage: FLOW_STAGES.BANK_DECISION,
      label: 'Bank Decision',
      module: 'partner/bank (external)',
      status: FLOW_STAGE_STATUSES.PENDING,
      durationMs: null,
      correlationId,
      inputSummary: 'Recommendation delivered to the bank',
      outputSummary: 'Awaiting the bank’s final decision (Slice 4 trust edge)',
      failureBehavior: 'Bank retains final authority; the network never blocks autonomously.',
      relatedAuditEventId: null,
    },
    {
      stage: FLOW_STAGES.OUTCOME,
      label: 'Outcome',
      module: 'partner/bank (external)',
      status: FLOW_STAGE_STATUSES.PENDING,
      durationMs: null,
      correlationId,
      inputSummary: 'Bank action + customer choice',
      outputSummary: 'Outcome submission not yet implemented',
      failureBehavior: 'Outcomes are append-only corrections, never silent rewrites.',
      relatedAuditEventId: null,
    },
    {
      stage: FLOW_STAGES.CONTINUOUS_LEARNING,
      label: 'Continuous Learning',
      module: 'analytics (off-path)',
      status: FLOW_STAGE_STATUSES.PENDING,
      durationMs: null,
      correlationId,
      inputSummary: 'Decisions + outcomes',
      outputSummary: 'Off critical path; deferred to a later version',
      failureBehavior: 'A reporting outage must never block a payment recommendation.',
      relatedAuditEventId: null,
    },
  ];

  return {
    correlationId,
    decisionId,
    startedAt: args.startedAtIso,
    stages,
  };
};
