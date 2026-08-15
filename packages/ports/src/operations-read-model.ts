import type {
  DecisionList,
  EventList,
  EventListQuery,
  FlowRun,
  OperationalEvent,
  OperationsSummary,
  ProviderHealth,
  RecommendationView,
} from '@sentra/contracts';

/**
 * Console read-model port. In-memory and PostgreSQL adapters both implement this so
 * Express routes never import a concrete store.
 */
export interface OperationsReadModel {
  recordEvaluation(output: {
    readonly recommendation: RecommendationView;
    readonly events: readonly OperationalEvent[];
    readonly flow: FlowRun;
  }): void;
  recordApiRequest(durationMs: number, failed: boolean): void;
  getDecision(decisionId: string): Promise<RecommendationView | undefined> | RecommendationView | undefined;
  getFlowByCorrelation(correlationId: string): Promise<FlowRun | undefined> | FlowRun | undefined;
  latestFlow(): Promise<FlowRun | null> | FlowRun | null;
  listDecisions(limit?: number, cursor?: string): Promise<DecisionList> | DecisionList;
  listEvents(query: EventListQuery): Promise<EventList> | EventList;
  getEvent(id: string): Promise<OperationalEvent | undefined> | OperationalEvent | undefined;
  summary(environment: string): Promise<OperationsSummary> | OperationsSummary;
  providers(lastSuccessAt?: string | null): Promise<readonly ProviderHealth[]> | readonly ProviderHealth[];
  checkDependencies(): Promise<readonly { name: string; status: 'ok' | 'unavailable'; latencyMs: number }[]>;
}
