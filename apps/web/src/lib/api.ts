import type {
  DecisionList,
  DevelopmentStatus,
  EventList,
  FlowRun,
  HealthResponse,
  OperationsSummary,
  OutboxEventView,
  OutboxList,
  ProviderHealth,
  QueueActionResult,
  QueueJobList,
  QueueMonitorSummary,
  ReadinessResponse,
  RecommendationView,
  SimulatorEvaluateRequest,
  SimulatorScenarioList,
  PartnerApiActivityList,
  PartnerConnectionList,
  SandboxSignedRequestResult,
  IssuedSigningKeyResponse,
  PartnerCredentialResponse,
} from '@sentra/contracts';

/**
 * Thin API client for the console. Every request goes to the same-origin `/api/*` proxy
 * (configured as a Next rewrite to the Express API), so the correlation-id response header
 * is always readable. Types come from `@sentra/contracts` — the frontend never redeclares
 * request or response shapes.
 */
import { authEnabled } from './supabase/config';
import { createClient } from './supabase/client';
import { readActiveOrg } from './active-org';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Attaches the signed-in user's Supabase access token when auth is enabled, so the API can
 * authenticate the console's calls, plus the selected organization when the operator belongs
 * to more than one (a single-org user is resolved server-side).
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (!authEnabled) {
    return {};
  }
  try {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (token === undefined) {
      return {};
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const activeOrg = readActiveOrg();
    if (activeOrg !== null) {
      headers['x-organization-id'] = activeOrg;
    }
    return headers;
  } catch {
    return {};
  }
}

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
    const auth = await authHeaders();
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...auth, ...(init?.headers ?? {}) },
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

const buildQuery = (query: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const suffix = params.toString();
  return suffix.length > 0 ? `?${suffix}` : '';
};

export const getQueueMonitor = (): Promise<ApiResult<QueueMonitorSummary>> =>
  apiFetch('/api/operations/queues');

export const getQueueJobs = (
  queueName: string,
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<QueueJobList>> =>
  apiFetch(`/api/operations/queues/${encodeURIComponent(queueName)}/jobs${buildQuery(query)}`);

export const getOutbox = (
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<OutboxList>> => apiFetch(`/api/operations/outbox${buildQuery(query)}`);

export const getOutboxEvent = (eventId: string): Promise<ApiResult<OutboxEventView>> =>
  apiFetch(`/api/operations/outbox/${encodeURIComponent(eventId)}`);

export const retryQueueJob = (
  queueName: string,
  jobId: string,
): Promise<ApiResult<QueueActionResult>> =>
  apiFetch(`/api/operations/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });

export const replayOutboxEvent = (eventId: string): Promise<ApiResult<QueueActionResult>> =>
  apiFetch(`/api/operations/outbox/${encodeURIComponent(eventId)}/replay`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });

export const duplicateOutboxDelivery = (eventId: string): Promise<ApiResult<QueueActionResult>> =>
  apiFetch(`/api/operations/outbox/${encodeURIComponent(eventId)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });

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

export const getApiActivity = (
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<PartnerApiActivityList & { redisState?: string; degraded?: boolean; detail?: string }>> =>
  apiFetch(`/api/operations/api-activity${buildQuery(query)}`);

export const getPartners = (
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<PartnerConnectionList & { bootstrapEnabled?: boolean; degraded?: boolean; detail?: string }>> =>
  apiFetch(`/api/operations/partners${buildQuery(query)}`);

export const createPartnerConnection = (
  body: Record<string, unknown>,
): Promise<ApiResult<PartnerCredentialResponse>> =>
  apiFetch('/api/operations/partners', { method: 'POST', body: JSON.stringify(body) });

export const rotatePartnerKey = (connectionId: string): Promise<ApiResult<IssuedSigningKeyResponse>> =>
  apiFetch(`/api/operations/partners/${encodeURIComponent(connectionId)}/keys`, { method: 'POST', body: '{}' });

export const revokePartnerKey = (connectionId: string, kid: string): Promise<ApiResult<{ revoked: boolean }>> =>
  apiFetch(
    `/api/operations/partners/${encodeURIComponent(connectionId)}/keys/${encodeURIComponent(kid)}/revoke`,
    { method: 'POST', body: '{}' },
  );

export const revokePartnerConnection = (connectionId: string): Promise<ApiResult<{ revoked: boolean }>> =>
  apiFetch(`/api/operations/partners/${encodeURIComponent(connectionId)}/revoke`, {
    method: 'POST',
    body: '{}',
  });

export const runSandboxSignedRequest = (
  kind: 'TELECOM_EVENTS' | 'BANK_API',
): Promise<ApiResult<SandboxSignedRequestResult>> =>
  apiFetch('/api/operations/sandbox/signed-request', {
    method: 'POST',
    body: JSON.stringify({ kind }),
  });

export interface AuthMembership {
  organizationId: string;
  organizationSlug: string;
  organizationType: string;
  role: string;
  permissions: string[];
  purposes: string[];
}

export interface MeResponse {
  user: { id: string; email: string; displayName: string };
  memberships: AuthMembership[];
  provisioned: boolean;
  providerMode: string;
}

/** Resolves the signed-in user from the API's verified `/auth/me`, using the bearer token. */
export const getCurrentUser = (token: string): Promise<ApiResult<MeResponse>> =>
  apiFetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });

export const postLogout = (token: string): Promise<ApiResult<{ ok: boolean }>> =>
  apiFetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: '{}',
  });

export interface MemberRow {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  activatedAt: string | null;
}

export const getMembers = (): Promise<ApiResult<{ items: MemberRow[] }>> => apiFetch('/api/members');

export const addMember = (email: string, role: string): Promise<ApiResult<MemberRow>> =>
  apiFetch('/api/members', { method: 'POST', body: JSON.stringify({ email, role }) });

export const updateMemberRole = (membershipId: string, role: string): Promise<ApiResult<MemberRow>> =>
  apiFetch(`/api/members/${encodeURIComponent(membershipId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const removeMember = (membershipId: string): Promise<ApiResult<{ removed: boolean }>> =>
  apiFetch(`/api/members/${encodeURIComponent(membershipId)}`, { method: 'DELETE' });

