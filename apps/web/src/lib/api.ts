import type {
  DecisionList,
  DevelopmentStatus,
  EventList,
  FlowRun,
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  ApiKeyCreatedResponse,
  ApiKeyListResponse,
  CreateInvitationRequest,
  InvitationCreatedResponse,
  InvitationListResponse,
  InvitationPreview,
  InvitationView,
  ApiKeyView,
  CreateApiKeyRequest,
  GoLiveRequestResponse,
  OperationsSummary,
  OrganizationDetailResponse,
  OrganizationSignupRequest,
  OrganizationSignupResponse,
  OutboxEventView,
  OutboxList,
  QueueActionResult,
  QueueJobList,
  QueueMonitorSummary,
  RecommendationView,
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

export const getInvitations = (): Promise<ApiResult<InvitationListResponse>> =>
  apiFetch('/api/invitations');

export const createInvitation = (
  input: CreateInvitationRequest,
): Promise<ApiResult<InvitationCreatedResponse>> =>
  apiFetch('/api/invitations', { method: 'POST', body: JSON.stringify(input) });

export const revokeInvitation = (invitationId: string): Promise<ApiResult<InvitationView>> =>
  apiFetch(`/api/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: 'POST',
    body: '{}',
  });

/** Public: what the invitee is shown before signing in. */
export const previewInvitation = (token: string): Promise<ApiResult<InvitationPreview>> =>
  apiFetch(`/api/invitations/preview?token=${encodeURIComponent(token)}`);

export const acceptInvitation = (
  input: AcceptInvitationRequest,
  token?: string,
): Promise<ApiResult<AcceptInvitationResponse>> =>
  apiFetch('/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(input),
    ...(token === undefined ? {} : { headers: { Authorization: `Bearer ${token}` } }),
  });

export const getCurrentOrg = (): Promise<ApiResult<OrganizationDetailResponse>> =>
  apiFetch('/api/orgs/current');

export const requestGoLive = (): Promise<ApiResult<GoLiveRequestResponse>> =>
  apiFetch('/api/orgs/request-go-live', { method: 'POST', body: '{}' });

export const getApiKeys = (): Promise<ApiResult<ApiKeyListResponse>> => apiFetch('/api/keys');

export const createApiKey = (
  input: CreateApiKeyRequest,
): Promise<ApiResult<ApiKeyCreatedResponse>> =>
  apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(input) });

export const revokeApiKey = (keyId: string): Promise<ApiResult<ApiKeyView>> =>
  apiFetch(`/api/keys/${encodeURIComponent(keyId)}/revoke`, { method: 'POST', body: '{}' });

/** Creates a new sandbox organization owned by the signed-in user. Auth token attached by apiFetch. */
export const signUpOrganization = (
  input: OrganizationSignupRequest,
  token?: string,
): Promise<ApiResult<OrganizationSignupResponse>> =>
  apiFetch('/api/orgs/signup', {
    method: 'POST',
    body: JSON.stringify(input),
    ...(token === undefined ? {} : { headers: { Authorization: `Bearer ${token}` } }),
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

export interface AuditEventRow {
  id: string;
  sequence: string;
  actorType: string;
  actorLabel: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  correlationId: string;
  occurredAt: string;
  hashPrev: string;
  hashSelf: string;
}

export interface AuditVerification {
  chainKey: string;
  valid: boolean;
  eventsVerified: number;
  firstSequence: string | null;
  lastSequence: string | null;
  brokenAtSequence: string | null;
  verifiedAt: string;
}

export const getAuditEvents = (
  query: Record<string, string | number | undefined> = {},
): Promise<ApiResult<{ items: AuditEventRow[]; nextCursor?: string }>> =>
  apiFetch(`/api/audit/events${buildQuery(query)}`);

export const verifyAuditChain = (): Promise<ApiResult<AuditVerification>> =>
  apiFetch('/api/audit/verify', { method: 'POST', body: '{}' });

