import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  NotFoundError,
  PURPOSES,
  RESOURCE_TYPES,
  type BankOutcomeRequest,
  type BankOutcomeResponse,
  type PaymentIntentRequest,
  type PaymentIntentResponse,
  type TelecomRiskEventRequest,
  type TelecomRiskEventResponse,
} from '@sentra/contracts';
import type { PrismaPartnerDomainStore } from '@sentra/adapters';
import type { AuditProvider, Clock, IdGenerator } from '@sentra/ports';
import type { EvaluatePaymentRiskUseCase } from '@sentra/core';
import { getCorrelationId } from '@sentra/observability';
import type { PartnerRequestContext } from './authenticator';

export interface PartnerIngestDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly audit: AuditProvider;
  readonly domain: PrismaPartnerDomainStore;
  readonly evaluate: EvaluatePaymentRiskUseCase;
}

export class PartnerIngest {
  public constructor(private readonly deps: PartnerIngestDeps) {}

  public async ingestTelecom(
    context: PartnerRequestContext,
    input: TelecomRiskEventRequest,
  ): Promise<TelecomRiskEventResponse> {
    const id = this.deps.ids.generate();
    const correlationId = getCorrelationId();
    const observedAt = input.observedAt === undefined ? this.deps.clock.now() : new Date(input.observedAt);

    await this.deps.domain.persistTelecomEvent({
      id,
      organizationId: context.connection.organizationId,
      subjectRef: input.subjectRef,
      purpose: input.purpose,
      eventType: input.eventType,
      recentSuspiciousCall: input.recentSuspiciousCall,
      callerReputation: input.callerReputation,
      callDurationSeconds: input.callDurationSeconds,
      deviceChange: input.deviceChange,
      accountTakeoverIndicators: input.accountTakeoverIndicators,
      scamCampaignMatch: input.scamCampaignMatch,
      telecomEvidence: input.telecomEvidence,
      severity: input.severity,
      observedAt,
      correlationId,
      source: `partner:${context.connection.id}`,
    });
    await this.deps.audit.recordStandalone({
      organizationId: context.connection.organizationId,
      actorType: ACTOR_TYPES.PARTNER,
      actorId: context.connection.id,
      actorLabel: context.principal.label,
      action: 'telecom_risk_event.ingested',
      resourceType: RESOURCE_TYPES.TELECOM_RISK_EVENT,
      resourceId: id,
      purpose: PURPOSES.PROTECT_PAYMENT,
      outcome: AUDIT_OUTCOMES.ALLOWED,
      correlationId,
    });

    return {
      id,
      organizationId: context.connection.organizationId,
      subjectRef: input.subjectRef,
      correlationId,
      receivedAt: this.deps.clock.now().toISOString(),
      synthetic: context.connection.environment === 'SANDBOX',
    };
  }

  public async ingestPayment(
    context: PartnerRequestContext,
    input: PaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    const correlationId = getCorrelationId();
    const output = await this.deps.evaluate.execute(
      {
        subjectRef: input.subjectRef,
        organizationId: context.connection.organizationId,
        correlationId,
        paymentAmount: input.paymentAmount,
        currency: input.currency,
        payeeAgeDays: input.payeeAgeDays,
        firstTimePayee: input.firstTimePayee,
        paymentVelocity24h: input.paymentVelocity24h,
        telecomEvidence: 'UNAVAILABLE',
        recentSuspiciousCall: false,
        callerReputation: 'UNKNOWN',
        callDurationSeconds: 0,
        scamCampaignMatch: false,
        deviceChange: input.deviceChange,
        accountTakeoverIndicators: input.accountTakeoverIndicators,
        customerVulnerability: input.customerVulnerability,
        identityVerificationResult: input.identityVerificationResult,
        previousWarnings: input.previousWarnings,
      },
      {
        correlationId,
        actorLabel: context.principal.label,
        organizationId: context.connection.organizationId,
        subjectRef: input.subjectRef,
      },
    );

    return {
      id: output.recommendation.decisionId,
      organizationId: context.connection.organizationId,
      subjectRef: input.subjectRef,
      correlationId,
      recommendation: output.recommendation,
      synthetic: context.connection.environment === 'SANDBOX',
    };
  }

  public async submitOutcome(
    context: PartnerRequestContext,
    input: BankOutcomeRequest,
  ): Promise<BankOutcomeResponse> {
    const id = this.deps.ids.generate();
    const correlationId = getCorrelationId();
    const result = await this.deps.domain.persistOutcome({
      id,
      organizationId: context.connection.organizationId,
      caseId: input.caseId,
      recommendationId: input.recommendationId ?? null,
      bankDecision: input.bankDecision,
      outcomeClassification: input.outcomeClassification,
      reference: input.reference ?? null,
      correlationId,
      source: `partner:${context.connection.id}`,
    });
    if (!result.ok) {
      throw new NotFoundError('case', input.caseId);
    }

    await this.deps.audit.recordStandalone({
      organizationId: context.connection.organizationId,
      actorType: ACTOR_TYPES.PARTNER,
      actorId: context.connection.id,
      actorLabel: context.principal.label,
      action: 'bank_outcome.recorded',
      resourceType: RESOURCE_TYPES.BANK_OUTCOME,
      resourceId: id,
      purpose: PURPOSES.PROTECT_PAYMENT,
      outcome: AUDIT_OUTCOMES.ALLOWED,
      correlationId,
    });

    return {
      id,
      organizationId: context.connection.organizationId,
      caseId: input.caseId,
      bankDecision: input.bankDecision,
      outcomeClassification: input.outcomeClassification,
      correlationId,
      synthetic: context.connection.environment === 'SANDBOX',
    };
  }

  public findRecommendation(organizationId: string, id: string) {
    return this.deps.domain.findRecommendation(organizationId, id);
  }

  public findLatestRecommendationForCase(organizationId: string, caseId: string) {
    return this.deps.domain.findLatestRecommendationForCase(organizationId, caseId);
  }
}

export const createPartnerIngest = (deps: PartnerIngestDeps): PartnerIngest => new PartnerIngest(deps);
