import type {
  ActorType,
  AuditOutcome,
  DataClassification,
  MemberRole,
  MemberStatus,
  OrganizationStatus,
  OrganizationType,
  PartnerConnectionKind,
  PartnerConnectionStatus,
  PartnerScope,
  Purpose,
  RetentionAction,
  RetentionPolicyStatus,
  RetentionRunStatus,
  SigningKeyStatus,
} from '@sentra/contracts';

/**
 * Persistence-facing record shapes.
 *
 * These live in the ports package rather than in the core so that a repository interface
 * can describe what it returns without the core and the ports depending on each other. They
 * are plain data: no methods, no provider types, and no Prisma import anywhere in reach of
 * the core (slide 038).
 *
 * The core maps these into its own domain types where behaviour is needed, and uses them
 * directly where a record is genuinely just data.
 */

export interface OrganizationRecord {
  id: string;
  slug: string;
  legalName: string;
  type: OrganizationType;
  status: OrganizationStatus;
  jurisdiction: string;
  dataResidency: string;
  defaultCurrency: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  source: string;
}

export interface UserRecord {
  id: string;
  primaryEmail: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  mfaEnabled: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface IdentityLinkRecord {
  id: string;
  userId: string;
  issuer: string;
  subject: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  removedAt: Date | null;
}

/** A membership joined with the tenant fields authorization needs. */
export interface MembershipWithOrganization extends MembershipRecord {
  organizationSlug: string;
  organizationType: OrganizationType;
  organizationStatus: OrganizationStatus;
}

export interface PartnerConnectionRecord {
  id: string;
  organizationId: string;
  name: string;
  kind: PartnerConnectionKind;
  clientId: string;
  scopes: readonly PartnerScope[];
  allowedPurposes: readonly Purpose[];
  ipAllowlist: readonly string[];
  tokenTtlSeconds: number;
  status: PartnerConnectionStatus;
  lastRotatedAt: Date | null;
  rotationDueAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
}

/**
 * The secret hash is a separate type so an ordinary read cannot accidentally serialise it.
 * Only the token endpoint asks for this shape.
 */
export interface PartnerConnectionWithSecret extends PartnerConnectionRecord {
  clientSecretHash: string;
}

export interface PartnerSigningKeyRecord {
  id: string;
  partnerConnectionId: string;
  organizationId: string;
  kid: string;
  algorithm: string;
  publicKeyJwk: Record<string, unknown>;
  status: SigningKeyStatus;
  notBefore: Date;
  notAfter: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface AuditEventRecord {
  id: string;
  chainKey: string;
  sequence: bigint;
  organizationId: string | null;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: Purpose;
  outcome: AuditOutcome;
  correlationId: string;
  requestId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  dataBefore: Record<string, unknown> | null;
  dataAfter: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
  recordedAt: Date;
  hashPrev: string;
  hashSelf: string;
  expiresAt: Date | null;
}

export type OutboxStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxEventRecord {
  id: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  correlationId: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  claimedAt: Date | null;
  claimToken: string | null;
  publishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface InboxEventRecord {
  id: string;
  source: string;
  externalId: string;
  eventType: string;
  correlationId: string | null;
  processedAt: Date;
  expiresAt: Date | null;
}

export type IdempotencyStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface IdempotencyRecord {
  id: string;
  organizationId: string;
  scope: string;
  key: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  correlationId: string;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface RetentionPolicyRecord {
  id: string;
  organizationId: string | null;
  resourceType: string;
  purpose: Purpose;
  retentionSeconds: number;
  action: RetentionAction;
  legalBasis: string;
  version: number;
  status: RetentionPolicyStatus;
  effectiveFrom: Date;
  createdAt: Date;
}

export interface RetentionRunRecord {
  id: string;
  retentionPolicyId: string;
  status: RetentionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  recordsAffected: number;
  proofHash: string | null;
  error: string | null;
  correlationId: string;
}

/** Re-exported so a repository signature can name a classification without a second import. */
export type { DataClassification };
