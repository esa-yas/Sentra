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
 *
 * Every tenant-data read takes an `organizationId` so a query can never span tenants: the
 * PostgreSQL adapter turns it into a `where` clause (real isolation), while the in-memory
 * demo adapter is single-session and treats it as advisory. `recordApiRequest`, `providers`,
 * and `checkDependencies` are process/infrastructure signals, not tenant data, and stay
 * unscoped.
 */
export interface OperationsReadModel {
  recordEvaluation(output: {
    readonly recommendation: RecommendationView;
    readonly events: readonly OperationalEvent[];
    readonly flow: FlowRun;
  }): void;
  recordApiRequest(durationMs: number, failed: boolean): void;
  getDecision(
    organizationId: string,
    decisionId: string,
  ): Promise<RecommendationView | undefined> | RecommendationView | undefined;
  getFlowByCorrelation(
    organizationId: string,
    correlationId: string,
  ): Promise<FlowRun | undefined> | FlowRun | undefined;
  latestFlow(organizationId: string): Promise<FlowRun | null> | FlowRun | null;
  listDecisions(
    organizationId: string,
    limit?: number,
    cursor?: string,
  ): Promise<DecisionList> | DecisionList;
  listEvents(organizationId: string, query: EventListQuery): Promise<EventList> | EventList;
  getEvent(
    organizationId: string,
    id: string,
  ): Promise<OperationalEvent | undefined> | OperationalEvent | undefined;
  summary(organizationId: string, environment: string): Promise<OperationsSummary> | OperationsSummary;
  providers(lastSuccessAt?: string | null): Promise<readonly ProviderHealth[]> | readonly ProviderHealth[];
  checkDependencies(): Promise<readonly { name: string; status: 'ok' | 'unavailable'; latencyMs: number }[]>;
}
