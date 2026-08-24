import {
  OPERATIONAL_EVENT_TYPES,
  recommendationViewSchema,
  type BankDecision,
  type OutcomeClassification,
  type Purpose,
  type RecommendationView,
} from '@sentra/contracts';
import type { Prisma, PrismaClient } from '@sentra/db';
import { toRecommendationView } from './reconstruct-journey';

export interface PersistTelecomEventInput {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectRef: string;
  readonly purpose: Purpose;
  readonly eventType: string;
  readonly recentSuspiciousCall: boolean;
  readonly callerReputation: string;
  readonly callDurationSeconds: number;
  readonly deviceChange: boolean;
  readonly accountTakeoverIndicators: boolean;
  readonly scamCampaignMatch: boolean;
  readonly telecomEvidence: string;
  readonly severity: string;
  readonly observedAt: Date;
  readonly correlationId: string;
  readonly source: string;
}

export interface PersistOutcomeInput {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly recommendationId: string | null;
  readonly bankDecision: BankDecision;
  readonly outcomeClassification: OutcomeClassification;
  readonly reference: string | null;
  readonly correlationId: string;
  readonly source: string;
}

export interface RecordCaseFeedbackInput {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly assessment: 'SCAM' | 'LEGITIMATE' | 'UNCLEAR';
  readonly note: string | null;
  readonly correlationId: string;
  readonly source: string;
}

export interface PendingCaseFeedbackRow {
  readonly caseId: string;
  readonly subjectRef: string;
  readonly bankDecision: BankDecision;
  readonly outcomeClassification: OutcomeClassification;
  readonly decidedAt: Date;
}

export class PrismaPartnerDomainStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async persistTelecomEvent(input: PersistTelecomEventInput): Promise<{ receivedAt: Date }> {
    const row = await this.prisma.telecomRiskEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        subjectRef: input.subjectRef,
        purpose: input.purpose,
        eventType: input.eventType,
        recentSuspiciousCall: input.recentSuspiciousCall,
        callerReputation: input.callerReputation as never,
        callDurationSeconds: input.callDurationSeconds,
        deviceChange: input.deviceChange,
        accountTakeoverIndicators: input.accountTakeoverIndicators,
        scamCampaignMatch: input.scamCampaignMatch,
        telecomEvidence: input.telecomEvidence as never,
        severity: input.severity as never,
        observedAt: input.observedAt,
        correlationId: input.correlationId,
        source: input.source,
      },
    });
    await this.prisma.operationalEvent.create({
      data: {
        id: `${input.id}_oe`,
        organizationId: input.organizationId,
        type: OPERATIONAL_EVENT_TYPES.TELECOM_RISK_EVENT,
        severity: input.severity as never,
        status: 'RECEIVED',
        actor: 'partner',
        subjectRef: input.subjectRef,
        provider: 'partner.telecom',
        synthetic: true,
        payloadPreview: {
          eventType: input.eventType,
          recentSuspiciousCall: input.recentSuspiciousCall,
        } as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        occurredAt: row.receivedAt,
      },
    });
    return { receivedAt: row.receivedAt };
  }

  public async persistOutcome(
    input: PersistOutcomeInput,
  ): Promise<{ ok: true } | { ok: false; reason: 'CASE_NOT_FOUND' }> {
    const found = await this.prisma.correlationCase.findFirst({
      where: { id: input.caseId, organizationId: input.organizationId },
    });
    if (found === null) {
      return { ok: false, reason: 'CASE_NOT_FOUND' };
    }
    await this.prisma.bankOutcome.upsert({
      where: { organizationId_caseId: { organizationId: input.organizationId, caseId: input.caseId } },
      create: {
        id: input.id,
        organizationId: input.organizationId,
        caseId: input.caseId,
        recommendationId: input.recommendationId,
        bankDecision: input.bankDecision,
        outcomeClassification: input.outcomeClassification,
        reference: input.reference,
        correlationId: input.correlationId,
        source: input.source,
        outcomeRecordedAt: new Date(),
      },
      update: {
        bankDecision: input.bankDecision,
        outcomeClassification: input.outcomeClassification,
        reference: input.reference,
        recommendationId: input.recommendationId,
        outcomeRecordedAt: new Date(),
      },
    });
    await this.prisma.operationalEvent.create({
      data: {
        id: `${input.id}_oe`,
        organizationId: input.organizationId,
        type: OPERATIONAL_EVENT_TYPES.BANK_OUTCOME,
        status: 'COMPLETED',
        actor: 'partner',
        provider: 'partner.bank',
        synthetic: true,
        payloadPreview: {
          bankDecision: input.bankDecision,
          outcomeClassification: input.outcomeClassification,
        } as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        occurredAt: new Date(),
      },
    });
    return { ok: true };
  }

  public async findRecommendation(
    organizationId: string,
    id: string,
  ): Promise<RecommendationView | null> {
    const row = await this.prisma.recommendation.findFirst({
      where: { id, organizationId },
      include: { riskAssessment: true, case: { include: { bankOutcomes: true } } },
    });
    return row === null ? null : recommendationViewSchema.parse(toRecommendationView(row, row.riskAssessment, []));
  }

  /**
   * Cases whose telecom signal belongs to this telecom, where a bank has recorded a decision and
   * the telecom has not yet given feedback. This is the pull side of the bank->telecom callback.
   */
  public async listPendingTelecomFeedback(
    telecomOrganizationId: string,
  ): Promise<readonly PendingCaseFeedbackRow[]> {
    const cases = await this.prisma.correlationCase.findMany({
      where: {
        telecomRiskEvent: { organizationId: telecomOrganizationId },
        bankOutcomes: { some: {} },
        telecomFeedback: { none: { organizationId: telecomOrganizationId } },
      },
      include: { bankOutcomes: { orderBy: { outcomeRecordedAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const rows: PendingCaseFeedbackRow[] = [];
    for (const c of cases) {
      const outcome = c.bankOutcomes[0];
      if (outcome === undefined) continue;
      rows.push({
        caseId: c.id,
        subjectRef: c.subjectRef,
        bankDecision: outcome.bankDecision as BankDecision,
        outcomeClassification: outcome.outcomeClassification as OutcomeClassification,
        decidedAt: outcome.outcomeRecordedAt ?? outcome.createdAt,
      });
    }
    return rows;
  }

  /**
   * Records a telecom's assessment of a case their signal touched. Verifies the case really is
   * one of theirs (its telecom risk event belongs to them) before writing, so a telecom can only
   * assess cases it actually contributed to.
   */
  public async recordCaseFeedback(
    input: RecordCaseFeedbackInput,
  ): Promise<{ ok: true; recordedAt: Date } | { ok: false; reason: 'CASE_NOT_FOUND' }> {
    const owned = await this.prisma.correlationCase.findFirst({
      where: { id: input.caseId, telecomRiskEvent: { organizationId: input.organizationId } },
      select: { id: true },
    });
    if (owned === null) {
      return { ok: false, reason: 'CASE_NOT_FOUND' };
    }
    const row = await this.prisma.telecomCaseFeedback.upsert({
      where: {
        organizationId_caseId: { organizationId: input.organizationId, caseId: input.caseId },
      },
      create: {
        id: input.id,
        organizationId: input.organizationId,
        caseId: input.caseId,
        assessment: input.assessment,
        note: input.note,
        correlationId: input.correlationId,
        source: input.source,
      },
      update: { assessment: input.assessment, note: input.note },
    });
    return { ok: true, recordedAt: row.createdAt };
  }

  public async findLatestRecommendationForCase(
    organizationId: string,
    caseId: string,
  ): Promise<RecommendationView | null> {
    const row = await this.prisma.recommendation.findFirst({
      where: { organizationId, caseId },
      orderBy: { issuedAt: 'desc' },
      include: { riskAssessment: true, case: { include: { bankOutcomes: true } } },
    });
    return row === null ? null : recommendationViewSchema.parse(toRecommendationView(row, row.riskAssessment, []));
  }
}

export const createPrismaPartnerDomainStore = (prisma: PrismaClient): PrismaPartnerDomainStore =>
  new PrismaPartnerDomainStore(prisma);
