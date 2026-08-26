import { PURPOSES } from '@sentra/contracts';
import { Prisma, type PrismaExecutor } from '@sentra/db';
import { redact } from '@sentra/observability';
import type {
  ConsentLookupResult,
  DecisionPersistence,
  IdGenerator,
  PersistDecisionJourneyInput,
  PersistedDecisionJourney,
  TransactionScope,
} from '@sentra/ports';
import { CONSENT_LOOKUP_STATUSES } from '@sentra/ports';
import type { PrismaOutboxRepository } from './prisma-outbox-repository';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';
import { reconstructFlow, toOperationalEvent, toRecommendationView } from './reconstruct-journey';

const SOURCE = 'evaluate';
/** Telecom signal lifetime for correlation: 5 minutes (mirrors TELECOM_ACTIVE_WINDOW_SECONDS). */
const TELECOM_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * MVP correlation: join a telecom risk event to a payment intent when they share
 * organizationId (tenant), opaque subjectRef, purpose PROTECT_PAYMENT, and the telecom
 * observation falls within `correlationWindowMs` of the payment initiation.
 *
 * Limitations: no fuzzy identity matching, no cross-issuer resolution, no graph. Partners
 * must mint pairwise subject references that already match when consent is shared. Telecom
 * events from another organization are never joined: telecomRiskEventId is unique on
 * correlation_cases, and tenant isolation forbids cross-org reads.
 */
export class PrismaDecisionPersistence implements DecisionPersistence {
  public constructor(
    private readonly unitOfWork: PrismaUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly outbox: PrismaOutboxRepository,
    private readonly correlationWindowMs: number,
    private readonly outboxMaxAttempts: number,
  ) {}

  private exec(scope: TransactionScope): PrismaExecutor {
    return this.unitOfWork.executor(scope);
  }

  public async lookupConsent(
    scope: TransactionScope,
    input: {
      readonly organizationId: string;
      readonly subjectRef: string;
      readonly purpose: (typeof PURPOSES)[keyof typeof PURPOSES];
      readonly now: Date;
    },
  ): Promise<ConsentLookupResult> {
    try {
      const row = await this.exec(scope).consentRecord.findUnique({
        where: {
          organizationId_subjectRef_purpose: {
            organizationId: input.organizationId,
            subjectRef: input.subjectRef,
            purpose: input.purpose,
          },
        },
      });
      if (row === null) {
        return { status: CONSENT_LOOKUP_STATUSES.MISSING };
      }
      if (row.status === 'WITHDRAWN') {
        return { status: CONSENT_LOOKUP_STATUSES.DENIED };
      }
      if (row.status === 'EXPIRED' || (row.validUntil !== null && row.validUntil <= input.now)) {
        return { status: CONSENT_LOOKUP_STATUSES.EXPIRED };
      }
      if (row.status === 'GRANTED') {
        return { status: CONSENT_LOOKUP_STATUSES.GRANTED };
      }
      return { status: CONSENT_LOOKUP_STATUSES.DENIED };
    } catch {
      return { status: CONSENT_LOOKUP_STATUSES.UNAVAILABLE };
    }
  }

  public async findByCorrelation(
    scope: TransactionScope,
    organizationId: string,
    correlationId: string,
  ): Promise<PersistedDecisionJourney | null> {
    const tx = this.exec(scope);
    const recommendation = await tx.recommendation.findFirst({
      where: { organizationId, correlationId },
      orderBy: { issuedAt: 'desc' },
      include: { riskAssessment: true, case: { include: { bankOutcomes: true } } },
    });
    if (recommendation === null) {
      return null;
    }
    return this.assemble(tx, recommendation);
  }

  public async persistJourney(scope: TransactionScope, input: PersistDecisionJourneyInput): Promise<void> {
    const tx = this.exec(scope);
    const { organizationId, subjectRef, correlationId, now } = input;

    const existingTelecom =
      (await tx.telecomRiskEvent.findFirst({
        where: { organizationId, correlationId },
      })) ??
      (await this.findSameTenantTelecom(tx, organizationId, subjectRef, now));
    const telecom =
      existingTelecom ??
      (input.telecomUsable
        ? await tx.telecomRiskEvent.create({
            data: {
              id: this.ids.generate(),
              organizationId,
              subjectRef,
              purpose: PURPOSES.PROTECT_PAYMENT,
              eventType: 'simulator.telecom_signal',
              recentSuspiciousCall: input.input.recentSuspiciousCall,
              callerReputation: input.input.callerReputation,
              callDurationSeconds: input.input.callDurationSeconds,
              deviceChange: input.input.deviceChange,
              accountTakeoverIndicators: input.input.accountTakeoverIndicators,
              scamCampaignMatch: input.input.scamCampaignMatch,
              telecomEvidence: input.input.telecomEvidence,
              severity: input.input.recentSuspiciousCall ? 'HIGH' : 'INFO',
              observedAt: now,
              // The inline signal is live for the same 5-minute window as an ingested one.
              expiresAt: new Date(now.getTime() + TELECOM_ACTIVE_WINDOW_MS),
              correlationId,
              source: SOURCE,
            },
          })
        : null);

    const existingPayment = await tx.paymentIntent.findFirst({
      where: { organizationId, correlationId },
    });
    const payment =
      existingPayment ??
      (await tx.paymentIntent.create({
        data: {
          id: this.ids.generate(),
          organizationId,
          subjectRef,
          purpose: PURPOSES.PROTECT_PAYMENT,
          amountMinor: BigInt(Math.round(input.input.paymentAmount * 100)),
          currency: input.input.currency,
          firstTimePayee: input.input.firstTimePayee,
          payeeAgeDays: input.input.payeeAgeDays,
          paymentVelocity24h: input.input.paymentVelocity24h,
          deviceChange: input.input.deviceChange,
          accountTakeoverIndicators: input.input.accountTakeoverIndicators,
          customerVulnerability: input.input.customerVulnerability,
          identityVerificationResult: input.input.identityVerificationResult,
          previousWarnings: input.input.previousWarnings,
          initiatedAt: now,
          correlationId,
          source: SOURCE,
        },
      }));

    const existingCase = await tx.correlationCase.findFirst({
      where: { organizationId, correlationId },
    });
    const correlationCase =
      existingCase ??
      (await tx.correlationCase.create({
        data: {
          id: this.ids.generate(),
          organizationId,
          subjectRef,
          status: 'RECOMMENDED',
          telecomRiskEventId: telecom?.id ?? null,
          paymentIntentId: payment.id,
          correlationBasis: `subject_ref + purpose within ${Math.round(this.correlationWindowMs / 1000)}s window`,
          correlationId,
          source: SOURCE,
        },
      }));

    const assessment = await tx.riskAssessment.create({
      data: {
        id: this.ids.generate(),
        organizationId,
        caseId: correlationCase.id,
        subjectRef,
        riskScore: input.recommendation.riskScore,
        riskLevel: input.recommendation.riskLevel,
        uncertainty: new Prisma.Decimal(String(input.recommendation.uncertainty)),
        reasonCodes: [...input.recommendation.reasonCodes],
        contributingSignals: input.recommendation.contributingSignals as Prisma.InputJsonValue,
        rulesTriggered: [...input.recommendation.rulesTriggered],
        evidenceSources: input.recommendation.evidenceSources as Prisma.InputJsonValue,
        missingProviders: [...input.recommendation.missingProviders],
        telecomEvidence: input.input.telecomEvidence,
        policyVersion: input.recommendation.policyVersion,
        rulesVersion: input.recommendation.rulesVersion,
        processingTimeMs: input.recommendation.processingTimeMs,
        evaluatedAt: now,
        correlationId,
        source: SOURCE,
      },
    });

    await tx.recommendation.create({
      data: {
        id: input.recommendation.decisionId,
        organizationId,
        caseId: correlationCase.id,
        riskAssessmentId: assessment.id,
        subjectRef,
        recommendedAction: input.recommendation.recommendedAction,
        alternativeActions: [...input.recommendation.alternativeActions],
        riskScore: input.recommendation.riskScore,
        riskLevel: input.recommendation.riskLevel,
        uncertainty: new Prisma.Decimal(String(input.recommendation.uncertainty)),
        reasonCodes: [...input.recommendation.reasonCodes],
        summary: input.recommendation.summary,
        authorityNote: input.recommendation.authorityNote,
        policyVersion: input.recommendation.policyVersion,
        rulesVersion: input.recommendation.rulesVersion,
        issuedAt: now,
        correlationId,
        source: SOURCE,
      },
    });

    if (input.events.length > 0) {
      await tx.operationalEvent.createMany({
        data: input.events.map((event) => ({
          id: event.id,
          organizationId,
          type: event.type,
          severity: event.severity,
          status: event.status,
          actor: event.actor,
          subjectRef: event.subjectRef ?? null,
          provider: event.provider,
          attempt: event.attempt,
          durationMs: event.durationMs ?? null,
          synthetic: event.synthetic,
          payloadPreview: redact(event.payloadPreview) as Prisma.InputJsonValue,
          correlationId,
          occurredAt: new Date(event.occurredAt),
        })),
        skipDuplicates: true,
      });
    }

    await this.outbox.enqueue(
      {
        id: this.ids.generate(),
        organizationId,
        aggregateType: 'recommendation',
        aggregateId: input.recommendation.decisionId,
        eventType: 'recommendation.issued',
        schemaVersion: 1,
        payload: redact({
          correlationId,
          recommendedAction: input.recommendation.recommendedAction,
          riskLevel: input.recommendation.riskLevel,
          riskScore: input.recommendation.riskScore,
        }) as Record<string, unknown>,
        correlationId,
        maxAttempts: this.outboxMaxAttempts,
        availableAt: now,
        expiresAt: null,
      },
      scope,
    );
  }

  private async findSameTenantTelecom(
    tx: PrismaExecutor,
    organizationId: string,
    subjectRef: string,
    now: Date,
  ): Promise<{ id: string } | null> {
    const windowStart = new Date(now.getTime() - this.correlationWindowMs);
    return tx.telecomRiskEvent.findFirst({
      where: {
        organizationId,
        subjectRef,
        purpose: PURPOSES.PROTECT_PAYMENT,
        observedAt: { gte: windowStart, lte: now },
        // A signal only counts while it is still live: the call must overlap the payment.
        // Older rows without an explicit expiry fall back to the outer correlation window.
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        case: { is: null },
      },
      orderBy: { observedAt: 'desc' },
    });
  }

  private async assemble(
    tx: PrismaExecutor,
    recommendation: {
      id: string;
      organizationId: string;
      subjectRef: string;
      recommendedAction: PersistDecisionJourneyInput['recommendation']['recommendedAction'];
      alternativeActions: PersistDecisionJourneyInput['recommendation']['alternativeActions'];
      riskScore: number;
      riskLevel: PersistDecisionJourneyInput['recommendation']['riskLevel'];
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
      riskAssessment: {
        contributingSignals: Prisma.JsonValue;
        rulesTriggered: string[];
        evidenceSources: Prisma.JsonValue;
        missingProviders: string[];
        processingTimeMs: number;
        evaluatedAt: Date;
      };
      case: { openedAt: Date; bankOutcomes: { id: string }[] };
    },
  ): Promise<PersistedDecisionJourney> {
    const events = await tx.operationalEvent.findMany({
      where: { correlationId: recommendation.correlationId },
      orderBy: { occurredAt: 'asc' },
    });
    const auditEvents = await tx.auditEvent.findMany({
      where: { correlationId: recommendation.correlationId },
      orderBy: { sequence: 'asc' },
    });
    const mappedEvents = events.map(toOperationalEvent);
    const view = toRecommendationView(recommendation, recommendation.riskAssessment, auditEvents);
    const flow = reconstructFlow({
      correlationId: recommendation.correlationId,
      decisionId: recommendation.id,
      startedAt: recommendation.case.openedAt,
      recommendation,
      events: mappedEvents,
      auditEvents,
      hasBankOutcome: recommendation.case.bankOutcomes.length > 0,
    });
    return { recommendation: view, events: mappedEvents, flow };
  }
}

export const createPrismaDecisionPersistence = (deps: {
  readonly unitOfWork: PrismaUnitOfWork;
  readonly ids: IdGenerator;
  readonly outbox: PrismaOutboxRepository;
  readonly correlationWindowMs: number;
  readonly outboxMaxAttempts: number;
}): PrismaDecisionPersistence =>
  new PrismaDecisionPersistence(
    deps.unitOfWork,
    deps.ids,
    deps.outbox,
    deps.correlationWindowMs,
    deps.outboxMaxAttempts,
  );
