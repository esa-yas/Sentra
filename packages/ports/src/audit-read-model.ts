import type {
  AuditChainVerificationResponse,
  AuditEventQuery,
  AuditEventResponse,
} from '@sentra/contracts';

export interface AuditEventList {
  readonly items: readonly AuditEventResponse[];
  readonly nextCursor?: string;
}

/**
 * Console-facing audit reads: list a tenant's events, and recompute its hash chain to prove
 * nothing was altered or removed after the fact. Both are scoped to one organization.
 */
export interface AuditReadModel {
  listEvents(organizationId: string, query: AuditEventQuery): Promise<AuditEventList>;
  verifyChain(organizationId: string): Promise<AuditChainVerificationResponse>;
}
