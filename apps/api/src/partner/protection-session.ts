import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  NotFoundError,
  PROTECTION_VERDICTS,
  PURPOSES,
  REVIEW_ROUTES,
  RESOURCE_TYPES,
  type AnswerSignal,
  type ProtectionSessionRequest,
  type ProtectionSessionResponse,
  type ResolveSessionRequest,
  type ResolveSessionResponse,
  type ReviewRoute,
  type SubmitAnswersRequest,
  type SubmitAnswersResponse,
} from '@sentra/contracts';
import {
  REASON_CODE_DEFINITIONS,
  adjustScoreForAnswers,
  answerSignalKey,
  applyLearning,
  buildDisplay,
  evaluateScamRisk,
  selectQuestions,
  sessionSignalKeys,
  signalForAnswer,
  toDisplayReasons,
  toPollQuestion,
  verdictForScore,
} from '@sentra/core';
import type { PrismaProtectionSessionStore, StoredAnswer } from '@sentra/adapters';
import type { AuditProvider, Clock, IdGenerator } from '@sentra/ports';
import { getCorrelationId } from '@sentra/observability';
import type { PartnerRequestContext } from './authenticator';

export interface ProtectionSessionDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly audit: AuditProvider;
  readonly store: PrismaProtectionSessionStore;
}

/**
 * A short reference a frightened person can read down the phone to their bank.
 *
 * Derived from the session id rather than a counter, so it needs no extra state and never
 * collides within the conversation it is used in. It is not a secret — it identifies a case to
 * someone who is already authenticated with their bank.
 */
const caseReferenceFor = (sessionId: string): string => {
  let hash = 0;
  for (const char of sessionId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
  }
  return `AC-${String(hash).padStart(5, '0')}`;
};

/**
 * Protection sessions: the engine's side of the bank SDK.
 *
 * The SDK sends a payment as the customer is confirming it and gets back everything needed to
 * render the moment — the verdict, the copy, and the questions. Nothing about how a scam is
 * explained lives in the app, so the wording, the thresholds and the questions can all improve
 * for every bank at once without one of them shipping a release.
 *
 * Sessions are also where the engine learns. What was advised, what the customer answered, and
 * how it ended are recorded together, and a resolution updates the per-signal evidence the next
 * score is weighted by.
 */
export class ProtectionSessionService {
  public constructor(private readonly deps: ProtectionSessionDeps) {}

  public async open(
    context: PartnerRequestContext,
    input: ProtectionSessionRequest,
  ): Promise<ProtectionSessionResponse> {
    const organizationId = context.connection.organizationId;
    const correlationId = getCorrelationId();
    const sessionId = this.deps.ids.generate();

    // The device's own view of the call is the freshest signal there is: a call in progress with
    // a number the customer has never saved is exactly the shape of a live scam.
    const suspiciousCall = input.onPhoneCall && input.callerUnknown;
    const assessment = evaluateScamRisk({
      subjectRef: input.subjectRef,
      paymentAmount: input.amount,
      currency: input.currency,
      payeeAgeDays: input.payeeAgeDays,
      firstTimePayee: input.firstTimePayee,
      paymentVelocity24h: input.paymentVelocity24h,
      telecomEvidence: 'OK',
      recentSuspiciousCall: suspiciousCall,
      callerReputation: suspiciousCall ? 'SUSPECT' : 'UNKNOWN',
      callDurationSeconds: 0,
      deviceChange: input.deviceChange,
      accountTakeoverIndicators: false,
      scamCampaignMatch: false,
      customerVulnerability: false,
      identityVerificationResult: 'NOT_CHECKED',
      previousWarnings: input.previousWarnings,
    });

    const reasonCodes = [...assessment.reasonCodes];
    const stats = await this.deps.store.statsFor(organizationId, reasonCodes);
    const score = applyLearning(assessment.riskScore, reasonCodes, stats);
    const verdict = verdictForScore(score);

    const reasons = toDisplayReasons(
      reasonCodes.map((code) => {
        const definition = REASON_CODE_DEFINITIONS[code];
        return {
          code,
          title: definition?.title ?? code,
          description: definition?.description ?? '',
        };
      }),
    );
    const caseReference = caseReferenceFor(sessionId);

    await this.deps.store.create({
      id: sessionId,
      organizationId,
      subjectRef: input.subjectRef,
      caseReference,
      amount: input.amount,
      currency: input.currency,
      verdict,
      riskScore: score,
      riskLevel: assessment.riskLevel,
      reasonCodes,
      correlationId,
      source: `partner:${context.connection.id}`,
    });

    await this.record(context, 'protection_session.opened', sessionId, correlationId);

    return {
      sessionId,
      verdict,
      riskLevel: assessment.riskLevel,
      riskScore: score,
      display: buildDisplay({
        verdict,
        riskLevel: assessment.riskLevel,
        amount: input.amount,
        currency: input.currency,
        ...(input.payeeLabel === undefined ? {} : { payeeLabel: input.payeeLabel }),
        reasons,
      }),
      // Only worth interrupting for questions when there is something to be suspicious about.
      questions:
        verdict === PROTECTION_VERDICTS.PROCEED
          ? []
          : selectQuestions(reasonCodes).map(toPollQuestion),
      caseReference,
      correlationId,
    };
  }

  public async submitAnswers(
    context: PartnerRequestContext,
    sessionId: string,
    input: SubmitAnswersRequest,
  ): Promise<SubmitAnswersResponse> {
    const organizationId = context.connection.organizationId;
    const session = await this.deps.store.find(organizationId, sessionId);
    if (session === null) {
      throw new NotFoundError('protection session', sessionId);
    }

    // The SDK returns the option that was chosen; only the engine knows what it means.
    const stored: StoredAnswer[] = [];
    const signals: AnswerSignal[] = [];
    for (const answer of input.answers) {
      const signal = signalForAnswer(answer.questionId, answer.optionId);
      if (signal === null) {
        continue;
      }
      stored.push({ questionId: answer.questionId, optionId: answer.optionId, signal });
      signals.push(signal);
    }

    const score = adjustScoreForAnswers(session.riskScore, signals);
    const verdict = verdictForScore(score);
    await this.deps.store.recordAnswers(sessionId, stored, verdict, score);
    await this.record(context, 'protection_session.answered', sessionId, getCorrelationId());

    const reasons = toDisplayReasons(
      session.reasonCodes.map((code) => {
        const definition = REASON_CODE_DEFINITIONS[code as keyof typeof REASON_CODE_DEFINITIONS];
        return {
          code,
          title: definition?.title ?? code,
          description: definition?.description ?? '',
        };
      }),
    );

    return {
      sessionId,
      verdict,
      riskLevel: session.riskLevel as SubmitAnswersResponse['riskLevel'],
      riskScore: score,
      display: buildDisplay({
        verdict,
        riskLevel: session.riskLevel as SubmitAnswersResponse['riskLevel'],
        amount: session.amount,
        currency: session.currency,
        reasons,
        afterAnswers: true,
      }),
      reviewRoute: this.routeFor(verdict),
      caseReference: session.caseReference,
    };
  }

  /**
   * Records how the payment actually ended — the only moment the engine gets a fact rather than
   * an inference, and therefore the only moment it can learn anything.
   */
  public async resolve(
    context: PartnerRequestContext,
    sessionId: string,
    input: ResolveSessionRequest,
  ): Promise<ResolveSessionResponse> {
    const organizationId = context.connection.organizationId;
    const session = await this.deps.store.find(organizationId, sessionId);
    if (session === null) {
      throw new NotFoundError('protection session', sessionId);
    }

    const resolvedAt = this.deps.clock.now();
    const signalKeys = sessionSignalKeys(
      session.reasonCodes,
      session.answers.map((answer) => answerSignalKey(answer.questionId, answer.optionId)),
    );

    await this.deps.store.resolve(
      sessionId,
      organizationId,
      input.outcome,
      input.confirmedScam,
      signalKeys,
      resolvedAt,
      (scope, key) => this.deps.ids.generate() + scope.slice(0, 1) + key.slice(0, 1),
    );
    await this.record(context, 'protection_session.resolved', sessionId, getCorrelationId());

    return { sessionId, outcome: input.outcome, recordedAt: resolvedAt.toISOString() };
  }

  /**
   * Where a held payment goes. The guardian route is chosen per customer in the Sentra app; until
   * that preference is wired through, every hold goes to the bank — the safe default.
   */
  private routeFor(verdict: SubmitAnswersResponse['verdict']): ReviewRoute {
    return verdict === PROTECTION_VERDICTS.HOLD ? REVIEW_ROUTES.BANK : REVIEW_ROUTES.NONE;
  }

  private async record(
    context: PartnerRequestContext,
    action: string,
    sessionId: string,
    correlationId: string,
  ): Promise<void> {
    await this.deps.audit.recordStandalone({
      organizationId: context.connection.organizationId,
      actorType: ACTOR_TYPES.PARTNER,
      actorId: context.connection.id,
      actorLabel: context.principal.label,
      action,
      resourceType: RESOURCE_TYPES.PAYMENT_INTENT,
      resourceId: sessionId,
      purpose: PURPOSES.PROTECT_PAYMENT,
      outcome: AUDIT_OUTCOMES.ALLOWED,
      correlationId,
    });
  }
}

export const createProtectionSessionService = (
  deps: ProtectionSessionDeps,
): ProtectionSessionService => new ProtectionSessionService(deps);
