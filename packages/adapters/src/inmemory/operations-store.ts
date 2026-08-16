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
import { redact } from '@sentra/observability';
import type { Clock } from '@sentra/ports';
import type { EvaluatePaymentRiskOutput } from '@sentra/core';

/**
 * The in-process read-model store behind the Operations Console for Version 1a.
 *
 * It is a dedicated projection, not a table dump (slide 043): the console reads shapes
 * designed for it, so Slice 2 can move persistence to Postgres read models without the
 * frontend noticing. Everything here is session-scoped and clearly synthetic; nothing is a
 * validated business-outcome figure.
 */
const EVENT_CAPACITY = 500;
const DECISION_CAPACITY = 300;
const LATENCY_SAMPLE_CAPACITY = 300;

export class InMemoryOperationsStore {
  private readonly events: OperationalEvent[] = [];
  private readonly decisions: RecommendationView[] = [];
  private readonly decisionsById = new Map<string, RecommendationView>();
  private readonly flowsByCorrelation = new Map<string, FlowRun>();
  private latestFlowRun: FlowRun | null = null;

  private readonly apiDurations: number[] = [];
  private apiRequests = 0;
  private apiFailures = 0;

  public constructor(private readonly clock: Clock) {}

  /** Ingests one evaluation, redacting event previews as defence-in-depth before storage. */
  public recordEvaluation(output: EvaluatePaymentRiskOutput): void {
    for (const event of output.events) {
      const safe: OperationalEvent = {
        ...event,
        payloadPreview: redact(event.payloadPreview) as Record<string, unknown>,
      };
      this.events.unshift(safe);
    }
    if (this.events.length > EVENT_CAPACITY) {
      this.events.length = EVENT_CAPACITY;
    }

    this.decisions.unshift(output.recommendation);
    this.decisionsById.set(output.recommendation.decisionId, output.recommendation);
    if (this.decisions.length > DECISION_CAPACITY) {
      const removed = this.decisions.splice(DECISION_CAPACITY);
      for (const entry of removed) {
        this.decisionsById.delete(entry.decisionId);
      }
    }

    this.flowsByCorrelation.set(output.flow.correlationId, output.flow);
    this.latestFlowRun = output.flow;
  }

  public recordApiRequest(durationMs: number, failed: boolean): void {
    this.apiRequests += 1;
    if (failed) {
      this.apiFailures += 1;
    }
    this.apiDurations.push(durationMs);
    if (this.apiDurations.length > LATENCY_SAMPLE_CAPACITY) {
      this.apiDurations.shift();
    }
  }

  // The in-memory store is a single synthetic session (demo mode), so `organizationId` is
  // accepted to satisfy the port but not used to partition data — real tenant isolation is
  // enforced by the PostgreSQL adapter.
  public getDecision(_organizationId: string, decisionId: string): RecommendationView | undefined {
    return this.decisionsById.get(decisionId);
  }

  public getFlowByCorrelation(_organizationId: string, correlationId: string): FlowRun | undefined {
    return this.flowsByCorrelation.get(correlationId);
  }

  public latestFlow(_organizationId: string): FlowRun | null {
    return this.latestFlowRun;
  }

  public listDecisions(_organizationId: string, limit = 50, cursor?: string): DecisionList {
    const start = cursor === undefined ? 0 : this.indexAfter(this.decisions.map((d) => d.decisionId), cursor);
    const slice = this.decisions.slice(start, start + limit);
    const items: DecisionListItem[] = slice.map((decision) => ({
      decisionId: decision.decisionId,
      correlationId: decision.correlationId,
      subjectRef: decision.subjectRef,
      organizationId: decision.organizationId,
      riskScore: decision.riskScore,
      riskLevel: decision.riskLevel,
      recommendedAction: decision.recommendedAction,
      evaluatedAt: decision.evaluatedAt,
      synthetic: decision.synthetic,
    }));
    const nextIndex = start + limit;
    const result: DecisionList = { items };
    if (nextIndex < this.decisions.length) {
      const nextCursor = this.decisions[nextIndex - 1]?.decisionId;
      if (nextCursor !== undefined) {
        return { ...result, nextCursor };
      }
    }
    return result;
  }

  public listEvents(_organizationId: string, query: EventListQuery): EventList {
    const filtered = this.events.filter((event) => {
      if (query.type !== undefined && event.type !== query.type) {
        return false;
      }
      if (query.severity !== undefined && event.severity !== query.severity) {
        return false;
      }
      if (query.status !== undefined && event.status !== query.status) {
        return false;
      }
      if (query.provider !== undefined && event.provider !== query.provider) {
        return false;
      }
      if (query.actor !== undefined && event.actor !== query.actor) {
        return false;
      }
      return true;
    });

    const start = query.cursor === undefined ? 0 : this.indexAfter(filtered.map((e) => e.id), query.cursor);
    const slice = filtered.slice(start, start + query.limit);
    const nextIndex = start + query.limit;
    const result: EventList = { items: slice };
    if (nextIndex < filtered.length) {
      const nextCursor = filtered[nextIndex - 1]?.id;
      if (nextCursor !== undefined) {
        return { ...result, nextCursor };
      }
    }
    return result;
  }

  public getEvent(_organizationId: string, id: string): OperationalEvent | undefined {
    return this.events.find((event) => event.id === id);
  }

  public summary(_organizationId: string, environment: string): OperationsSummary {
    const byAction = (action: string): number =>
      this.decisions.filter((d) => d.recommendedAction === action).length;
    const byLevel = (level: string): number =>
      this.decisions.filter((d) => d.riskLevel === level).length;
    const byType = (type: string): number => this.events.filter((e) => e.type === type).length;

    const sorted = [...this.apiDurations].sort((a, b) => a - b);
    const percentile = (p: number): number => {
      if (sorted.length === 0) {
        return 0;
      }
      const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return Math.round((sorted[index] ?? 0) * 100) / 100;
    };

    const lastDecisionAt = this.decisions[0]?.evaluatedAt ?? null;

    return {
      environment,
      providerMode: 'in-memory',
      generatedAt: this.clock.now().toISOString(),
      volume: {
        origin: 'MEASURED',
        riskEventsReceived: byType('telecom.risk_event.received'),
        paymentIntentsReceived: byType('payment.intent.received'),
        correlatedCases: byType('correlation.matched'),
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
        origin: 'SYNTHETIC',
        confirmedScams: 0,
        falsePositives: 0,
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
        note: 'Durable queue lands in Slice 3 (Redis + BullMQ). No queue is wired yet.',
      },
      providers: this.providers(lastDecisionAt),
    };
  }

  public providers(lastSuccessAt: string | null = this.decisions[0]?.evaluatedAt ?? null): ProviderHealth[] {
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
      lastFailureAt: null,
      latencyMs: 1,
    });

    const notConfigured = (
      name: string,
      kind: ProviderHealth['kind'],
      detail: string,
    ): ProviderHealth => ({
      name,
      kind,
      state: PROVIDER_HEALTH_STATES.NOT_CONFIGURED,
      implementation: detail,
      lastSuccessAt: null,
      lastFailureAt: null,
      latencyMs: null,
    });

    return [
      connected('Audit chain', 'AUTH', 'in-memory (hash-chained)'),
      connected('Risk signals', 'RISK_SIGNAL', 'in-memory (synthetic)'),
      notConfigured('PostgreSQL', 'DATABASE', 'not wired — Slice 2'),
      notConfigured('Redis', 'CACHE', 'not wired — Slice 3'),
      notConfigured('BullMQ', 'QUEUE', 'not wired — Slice 3'),
      notConfigured('Notification', 'NOTIFICATION', 'not wired — later slice'),
      notConfigured('Supabase auth', 'AUTH', 'not wired — Slice 4'),
      notConfigured('Storage', 'STORAGE', 'not wired — later slice'),
      notConfigured('Gemini / AI', 'AI', 'contract-only — off the deterministic path'),
    ];
  }

  public async checkDependencies(): Promise<readonly { name: string; status: 'ok' | 'unavailable'; latencyMs: number }[]> {
    return [
      { name: 'in-memory-store', status: 'ok', latencyMs: 0 },
      { name: 'audit-chain', status: 'ok', latencyMs: 0 },
    ];
  }

  private indexAfter(ids: readonly string[], cursor: string): number {
    const index = ids.indexOf(cursor);
    return index < 0 ? 0 : index + 1;
  }
}

export const createInMemoryOperationsStore = (clock: Clock): InMemoryOperationsStore =>
  new InMemoryOperationsStore(clock);
