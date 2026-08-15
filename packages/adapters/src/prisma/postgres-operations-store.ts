import {
  PROVIDER_HEALTH_STATES,
  RECOMMENDATION_ACTIONS,
  RISK_LEVELS,
  type DecisionList,
  type DecisionListItem,
  type EventList,
  type EventListQuery,
  type FlowRun,
  type OperationalEvent,
  type OperationsSummary,
  type ProviderHealth,
  type RecommendationView,
} from '@sentra/contracts';
import type { PrismaClient } from '@sentra/db';
import type { Clock, OperationsReadModel } from '@sentra/ports';
import { reconstructFlow, toOperationalEvent, toRecommendationView } from './reconstruct-journey';

const LIST_CAP = 100;

/**
 * PostgreSQL-backed console read models. Reconstructs API contracts from persisted rows
 * rather than returning Prisma entities. Process-local API latency counters remain in
 * memory (they are not business truth).
 */
export class PostgresOperationsStore implements OperationsReadModel {
  private readonly apiDurations: number[] = [];
  private apiRequests = 0;
  private apiFailures = 0;
  private lastDbSuccessAt: string | null = null;
  private lastDbFailureAt: string | null = null;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {}

  public recordEvaluation(_output: {
    readonly recommendation: RecommendationView;
    readonly events: readonly OperationalEvent[];
    readonly flow: FlowRun;
  }): void {
    // Persistence already happened inside the evaluate transaction.
    this.lastDbSuccessAt = this.clock.now().toISOString();
  }

  public recordApiRequest(durationMs: number, failed: boolean): void {
    this.apiRequests += 1;
    if (failed) {
      this.apiFailures += 1;
    }
    this.apiDurations.push(durationMs);
    if (this.apiDurations.length > 300) {
      this.apiDurations.shift();
    }
  }

  public async getDecision(decisionId: string): Promise<RecommendationView | undefined> {
    const row = await this.prisma.recommendation.findUnique({
      where: { id: decisionId },
      include: { riskAssessment: true, case: { include: { bankOutcomes: true } } },
    });
    if (row === null) {
      return undefined;
    }
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: { correlationId: row.correlationId },
      orderBy: { sequence: 'asc' },
    });
    return toRecommendationView(row, row.riskAssessment, auditEvents);
  }

  public async getFlowByCorrelation(correlationId: string): Promise<FlowRun | undefined> {
    const assembled = await this.loadByCorrelation(correlationId);
    return assembled?.flow;
  }

  public async latestFlow(): Promise<FlowRun | null> {
    const latest = await this.prisma.recommendation.findFirst({
      orderBy: { issuedAt: 'desc' },
      select: { correlationId: true },
    });
    if (latest === null) {
      return null;
    }
    return (await this.getFlowByCorrelation(latest.correlationId)) ?? null;
  }

  public async listDecisions(limit = 50, cursor?: string): Promise<DecisionList> {
    const take = Math.min(Math.max(limit, 1), LIST_CAP);
    const rows = await this.prisma.recommendation.findMany({
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor === undefined
        ? {}
        : { cursor: { id: cursor }, skip: 1 }),
    });
    const page = rows.slice(0, take);
    const items: DecisionListItem[] = page.map((row) => ({
      decisionId: row.id,
      correlationId: row.correlationId,
      subjectRef: row.subjectRef,
      organizationId: row.organizationId,
      riskScore: row.riskScore,
      riskLevel: row.riskLevel,
      recommendedAction: row.recommendedAction,
      evaluatedAt: row.issuedAt.toISOString(),
      synthetic: row.source === 'seed' || row.source === 'evaluate',
    }));
    const result: DecisionList = { items };
    if (rows.length > take) {
      return { ...result, nextCursor: page[page.length - 1]?.id };
    }
    return result;
  }

  public async listEvents(query: EventListQuery): Promise<EventList> {
    const take = Math.min(query.limit, LIST_CAP);
    const rows = await this.prisma.operationalEvent.findMany({
      where: {
        ...(query.type === undefined ? {} : { type: query.type }),
        ...(query.severity === undefined ? {} : { severity: query.severity }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.provider === undefined ? {} : { provider: query.provider }),
        ...(query.actor === undefined ? {} : { actor: query.actor }),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    });
    const page = rows.slice(0, take);
    const result: EventList = { items: page.map(toOperationalEvent) };
    if (rows.length > take) {
      return { ...result, nextCursor: page[page.length - 1]?.id };
    }
    return result;
  }

  public async getEvent(id: string): Promise<OperationalEvent | undefined> {
    const row = await this.prisma.operationalEvent.findUnique({ where: { id } });
    return row === null ? undefined : toOperationalEvent(row);
  }

  public async summary(environment: string): Promise<OperationsSummary> {
    const [
      telecomCount,
      paymentCount,
      caseCount,
      recommendations,
      confirmedScams,
      falsePositives,
    ] = await Promise.all([
      this.prisma.telecomRiskEvent.count(),
      this.prisma.paymentIntent.count(),
      this.prisma.correlationCase.count(),
      this.prisma.recommendation.findMany({ select: { recommendedAction: true, riskLevel: true } }),
      this.prisma.bankOutcome.count({ where: { outcomeClassification: 'CONFIRMED_SCAM' } }),
      this.prisma.bankOutcome.count({ where: { outcomeClassification: 'FALSE_POSITIVE' } }),
    ]);

    const byAction = (action: string): number =>
      recommendations.filter((row) => row.recommendedAction === action).length;
    const byLevel = (level: string): number =>
      recommendations.filter((row) => row.riskLevel === level).length;

    const sorted = [...this.apiDurations].sort((a, b) => a - b);
    const percentile = (p: number): number => {
      if (sorted.length === 0) {
        return 0;
      }
      const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return Math.round((sorted[index] ?? 0) * 100) / 100;
    };

    const last = await this.prisma.recommendation.findFirst({
      orderBy: { issuedAt: 'desc' },
      select: { issuedAt: true },
    });
    const lastSuccessAt = last?.issuedAt.toISOString() ?? this.lastDbSuccessAt;

    return {
      environment,
      providerMode: 'real',
      generatedAt: this.clock.now().toISOString(),
      volume: {
        origin: 'MEASURED',
        riskEventsReceived: telecomCount,
        paymentIntentsReceived: paymentCount,
        correlatedCases: caseCount,
        warningsIssued: byAction(RECOMMENDATION_ACTIONS.WARN),
        paymentsDelayed: byAction(RECOMMENDATION_ACTIONS.DELAY),
        callbackRecommendations: byAction(RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK),
        analystReviewRecommendations: byAction(RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW),
        blockRecommendations: byAction(RECOMMENDATION_ACTIONS.BLOCK_RECOMMENDED),
      },
      caseSeverity: {
        origin: 'MEASURED',
        low: byLevel(RISK_LEVELS.LOW),
        medium: byLevel(RISK_LEVELS.MEDIUM),
        high: byLevel(RISK_LEVELS.HIGH),
        critical: byLevel(RISK_LEVELS.CRITICAL),
      },
      outcomes: {
        origin: 'MEASURED',
        confirmedScams,
        falsePositives,
      },
      api: {
        origin: 'MEASURED',
        requestsHandled: this.apiRequests,
        p50LatencyMs: percentile(50),
        p95LatencyMs: percentile(95),
        failedRequests: this.apiFailures,
      },
      queue: {
        origin: 'SYNTHETIC',
        depth: 0,
        failedJobs: 0,
        note: 'Durable queue lands in Slice 3 (Redis + BullMQ). Outbox rows remain pending.',
      },
      providers: [...(await this.providers(lastSuccessAt))],
    };
  }

  public async providers(lastSuccessAt: string | null = this.lastDbSuccessAt): Promise<readonly ProviderHealth[]> {
    const connected = (
      name: string,
      kind: ProviderHealth['kind'],
      implementation: string,
    ): ProviderHealth => ({
      name,
      kind,
      state: PROVIDER_HEALTH_STATES.CONNECTED,
      implementation,
      lastSuccessAt,
      lastFailureAt: this.lastDbFailureAt,
      latencyMs: 1,
    });
    const notConfigured = (name: string, kind: ProviderHealth['kind'], detail: string): ProviderHealth => ({
      name,
      kind,
      state: PROVIDER_HEALTH_STATES.NOT_CONFIGURED,
      implementation: detail,
      lastSuccessAt: null,
      lastFailureAt: null,
      latencyMs: null,
    });

    return [
      connected('PostgreSQL / Supabase', 'DATABASE', 'Prisma adapter (pooled)'),
      connected('Audit chain', 'AUTH', 'PostgreSQL hash chain (canonical v1)'),
      connected('Risk signals', 'RISK_SIGNAL', 'persisted telecom_risk_events'),
      notConfigured('Redis', 'CACHE', 'not wired — Slice 3'),
      notConfigured('BullMQ', 'QUEUE', 'not wired — Slice 3'),
      notConfigured('Notification', 'NOTIFICATION', 'not wired — later slice'),
      notConfigured('Supabase auth', 'AUTH', 'not wired — Slice 4'),
      notConfigured('Storage', 'STORAGE', 'not wired — later slice'),
      notConfigured('Gemini / AI', 'AI', 'contract-only — off the deterministic path'),
    ];
  }

  public async checkDependencies(): Promise<readonly { name: string; status: 'ok' | 'unavailable'; latencyMs: number }[]> {
    const started = this.clock.monotonicMs();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Math.max(0, Math.round(this.clock.monotonicMs() - started));
      this.lastDbSuccessAt = this.clock.now().toISOString();
      return [
        { name: 'postgresql', status: 'ok', latencyMs },
        { name: 'audit-chain', status: 'ok', latencyMs },
      ];
    } catch {
      const latencyMs = Math.max(0, Math.round(this.clock.monotonicMs() - started));
      this.lastDbFailureAt = this.clock.now().toISOString();
      return [{ name: 'postgresql', status: 'unavailable', latencyMs }];
    }
  }

  private async loadByCorrelation(correlationId: string): Promise<{ flow: FlowRun } | null> {
    const recommendation = await this.prisma.recommendation.findFirst({
      where: { correlationId },
      orderBy: { issuedAt: 'desc' },
      include: { riskAssessment: true, case: { include: { bankOutcomes: true } } },
    });
    if (recommendation === null) {
      return null;
    }
    const events = await this.prisma.operationalEvent.findMany({
      where: { correlationId },
      orderBy: { occurredAt: 'asc' },
    });
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: { correlationId },
      orderBy: { sequence: 'asc' },
    });
    const mapped = events.map(toOperationalEvent);
    return {
      flow: reconstructFlow({
        correlationId,
        decisionId: recommendation.id,
        startedAt: recommendation.case.openedAt,
        recommendation,
        events: mapped,
        auditEvents,
        hasBankOutcome: recommendation.case.bankOutcomes.length > 0,
      }),
    };
  }
}

export const createPostgresOperationsStore = (
  prisma: PrismaClient,
  clock: Clock,
): PostgresOperationsStore => new PostgresOperationsStore(prisma, clock);
