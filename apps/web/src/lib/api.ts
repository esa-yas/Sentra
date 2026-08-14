import type {
  DecisionList,
  DevelopmentStatus,
  EventList,
  FlowRun,
  HealthResponse,
  OperationsSummary,
  ProviderHealth,
  ReadinessResponse,
  RecommendationView,
  SimulatorEvaluateRequest,
  SimulatorScenarioList,
} from '@sentra/contracts';

/**
 * Thin API client for the console. Every request goes to the same-origin `/api/*` proxy
 * (configured as a Next rewrite to the Express API), so the correlation-id response header
 * is always readable. Types come from `@sentra/contracts` — the frontend never redeclares
 * request or response shapes.
 */
const CORRELATION_HEADER = 'x-correlation-id';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  correlationId: string | null;
  error?: ApiError;
}

const readError = (body: unknown, fallback: string): ApiError => {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const envelope = (body as { error?: Partial<ApiError> }).error;
    if (envelope !== undefined) {
      return {
        code: envelope.code ?? 'unknown',
        message: envelope.message ?? fallback,
        details: envelope.details,
      };
    }
  }
  return { code: 'unknown', message: fallback };
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    const correlationId = response.headers.get(CORRELATION_HEADER);
    const body: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        correlationId,
        error: readError(body, response.statusText),
      };
    }
    return { ok: true, status: response.status, data: body as T, correlationId };
  } catch {
    return {
      ok: false,
      status: 0,
      correlationId: null,
      error: { code: 'network_error', message: 'Could not reach the Sentra API. Is it running on the configured origin?' },
    };
  }
}

export const getSummary = (): Promise<ApiResult<OperationsSummary>> =>
  apiFetch('/api/operations/summary');

export const getDevelopmentStatus = (): Promise<ApiResult<DevelopmentStatus>> =>
  apiFetch('/api/operations/development-status');

export const getIntegrations = (): Promise<ApiResult<{ items: ProviderHealth[] }>> =>
  apiFetch('/api/operations/integrations');

export const getScenarios = (): Promise<ApiResult<SimulatorScenarioList>> =>
  apiFetch('/api/simulator/scenarios');

export const getLatestFlow = (): Promise<ApiResult<FlowRun>> =>
  apiFetch('/api/operations/flow/latest');

export const getFlow = (correlationId: string): Promise<ApiResult<FlowRun>> =>
  apiFetch(`/api/operations/flow/${encodeURIComponent(correlationId)}`);

export const getCases = (): Promise<ApiResult<DecisionList>> => apiFetch('/api/cases');

export interface CaseDetail {
  recommendation: RecommendationView;
  flow: FlowRun | null;
}

export const getCase = (id: string): Promise<ApiResult<CaseDetail>> =>
  apiFetch(`/api/cases/${encodeURIComponent(id)}`);

export const getHealth = (): Promise<ApiResult<HealthResponse>> => apiFetch('/health');

export const getReadiness = (): Promise<ApiResult<ReadinessResponse>> => apiFetch('/ready');

export interface EvaluateResponse {
  recommendation: RecommendationView;
  flow: FlowRun;
}

export const evaluate = (input: SimulatorEvaluateRequest): Promise<ApiResult<EvaluateResponse>> =>
  apiFetch('/api/simulator/evaluate', { method: 'POST', body: JSON.stringify(input) });

export const getEvents = (
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<EventList>> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const suffix = params.toString();
  return apiFetch(`/api/events${suffix.length > 0 ? `?${suffix}` : ''}`);
};
