import type {
  MemberRole,
  MemberStatus,
  OrganizationStatus,
  OrganizationType,
  PartnerConnectionKind,
  PartnerConnectionStatus,
  PartnerScope,
  Purpose,
  RetentionAction,
} from '@sentra/contracts';
import type { TransactionScope } from './unit-of-work';
import type {
  AuditEventRecord,
  IdempotencyRecord,
  IdentityLinkRecord,
  InboxEventRecord,
  MembershipRecord,
  MembershipWithOrganization,
  OrganizationRecord,
  OutboxEventRecord,
  PartnerConnectionRecord,
  PartnerConnectionWithSecret,
  PartnerSigningKeyRecord,
  RetentionPolicyRecord,
  RetentionRunRecord,
  UserRecord,
} from './models';

/**
 * Repository interfaces.
 *
 * Every method optionally accepts a {@link TransactionScope}. Omitting it means "use the
 * pooled connection"; passing it enlists the call in the caller's transaction, which is how
 * a use case commits a business change with its audit and outbox rows atomically.
 *
 * Two rules are enforced by shape rather than by convention:
 *   * Reads that could cross a tenant boundary require an `organizationId`, so a missing
 *     authorization check shows up as a compile error rather than a data leak.
 *   * No repository exposes a raw query surface. A module cannot reach another module's
 *     tables (slide 027) because no interface here lets it.
 */

export interface Pagination {
  readonly cursor?: string;
  readonly limit: number;
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export interface CreateOrganizationInput {
  readonly id: string;
  readonly slug: string;
  readonly legalName: string;
  readonly type: OrganizationType;
  readonly jurisdiction: string;
  readonly dataResidency: string;
  readonly defaultCurrency: string;
  readonly createdBy: string | null;
  readonly source: string;
  readonly correlationId: string;
}

export interface UpdateOrganizationInput {
  readonly legalName?: string;
  readonly status?: OrganizationStatus;
  readonly defaultCurrency?: string;
}

export interface OrganizationRepository {
  create(input: CreateOrganizationInput, scope?: TransactionScope): Promise<OrganizationRecord>;
  findById(id: string, scope?: TransactionScope): Promise<OrganizationRecord | null>;
  findBySlug(slug: string, scope?: TransactionScope): Promise<OrganizationRecord | null>;
  update(
    id: string,
    input: UpdateOrganizationInput,
    scope?: TransactionScope,
  ): Promise<OrganizationRecord>;
  /** Restricted to the identifiers the caller is already authorized for. */
  listByIds(ids: readonly string[], scope?: TransactionScope): Promise<readonly OrganizationRecord[]>;
}

export interface CreateUserInput {
  readonly id: string;
  readonly primaryEmail: string;
  readonly displayName: string;
  readonly source: string;
}

export interface UserRepository {
  create(input: CreateUserInput, scope?: TransactionScope): Promise<UserRecord>;
  findById(id: string, scope?: TransactionScope): Promise<UserRecord | null>;
  findByEmail(email: string, scope?: TransactionScope): Promise<UserRecord | null>;
  touchLastSeen(id: string, at: Date, scope?: TransactionScope): Promise<void>;
}

export interface CreateIdentityLinkInput {
  readonly id: string;
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
}

export interface IdentityLinkRepository {
  create(input: CreateIdentityLinkInput, scope?: TransactionScope): Promise<IdentityLinkRecord>;
  findByIssuerAndSubject(
    issuer: string,
    subject: string,
    scope?: TransactionScope,
  ): Promise<IdentityLinkRecord | null>;
  touchLastUsed(id: string, at: Date, scope?: TransactionScope): Promise<void>;
}

export interface CreateMembershipInput {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly status: MemberStatus;
  readonly invitedBy: string | null;
  readonly activatedAt: Date | null;
  readonly correlationId: string;
}

export interface MembershipRepository {
  create(input: CreateMembershipInput, scope?: TransactionScope): Promise<MembershipRecord>;
  findById(id: string, scope?: TransactionScope): Promise<MembershipRecord | null>;
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
    scope?: TransactionScope,
  ): Promise<MembershipRecord | null>;
  /** Every active membership for one user, joined with the tenant fields authorization needs. */
  listActiveForUser(
    userId: string,
    scope?: TransactionScope,
  ): Promise<readonly MembershipWithOrganization[]>;
  listForOrganization(
    organizationId: string,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<MembershipRecord>>;
  updateRole(id: string, role: MemberRole, scope?: TransactionScope): Promise<MembershipRecord>;
  updateStatus(
    id: string,
    status: MemberStatus,
    at: Date,
    scope?: TransactionScope,
  ): Promise<MembershipRecord>;
  /**
   * Counts active members holding a role, so removing the last owner can be refused. A
   * tenant with no owner is unrecoverable without platform intervention.
   */
  countActiveByRole(
    organizationId: string,
    role: MemberRole,
    scope?: TransactionScope,
  ): Promise<number>;
}

// ---------------------------------------------------------------------------
// Partner integrations
// ---------------------------------------------------------------------------

export interface CreatePartnerConnectionInput {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly kind: PartnerConnectionKind;
  readonly clientId: string;
  readonly clientSecretHash: string;
  readonly scopes: readonly PartnerScope[];
  readonly allowedPurposes: readonly Purpose[];
  readonly ipAllowlist: readonly string[];
  readonly tokenTtlSeconds: number;
  readonly rotationDueAt: Date | null;
  readonly createdBy: string | null;
  readonly source: string;
  readonly correlationId: string;
}

export interface PartnerConnectionRepository {
  create(
    input: CreatePartnerConnectionInput,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord>;
  /** Tenant-scoped read. */
  findById(
    organizationId: string,
    id: string,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord | null>;
  /**
   * Looks a connection up by client identifier for the token endpoint, which has no tenant
   * context yet. Returns the secret hash, so this is the only unscoped read available.
   */
  findByClientIdWithSecret(
    clientId: string,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionWithSecret | null>;
  listForOrganization(
    organizationId: string,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<PartnerConnectionRecord>>;
  rotateSecret(
    organizationId: string,
    id: string,
    clientSecretHash: string,
    rotatedAt: Date,
    rotationDueAt: Date | null,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord>;
  updateStatus(
    organizationId: string,
    id: string,
    status: PartnerConnectionStatus,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord>;
}

export interface RegisterSigningKeyInput {
  readonly id: string;
  readonly partnerConnectionId: string;
  readonly kid: string;
  readonly algorithm: string;
  readonly publicKeyJwk: Record<string, unknown>;
  readonly notBefore: Date;
  readonly notAfter: Date | null;
  readonly createdBy: string | null;
  readonly correlationId: string;
}

export interface PartnerSigningKeyRepository {
  register(input: RegisterSigningKeyInput, scope?: TransactionScope): Promise<PartnerSigningKeyRecord>;
  /**
   * Resolves a key for signature verification. Scoped by tenant so a valid signature from
   * one partner cannot authenticate an event submitted as another (slide 013).
   */
  findActiveByOrganizationAndKid(
    organizationId: string,
    kid: string,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord | null>;
  listForConnection(
    organizationId: string,
    partnerConnectionId: string,
    scope?: TransactionScope,
  ): Promise<readonly PartnerSigningKeyRecord[]>;
  revoke(
    organizationId: string,
    id: string,
    revokedAt: Date,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord>;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AppendAuditEventInput {
  readonly id: string;
  readonly chainKey: string;
  readonly sequence: bigint;
  readonly organizationId: string | null;
  readonly actorType: AuditEventRecord['actorType'];
  readonly actorId: string | null;
  readonly actorLabel: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly purpose: Purpose;
  readonly outcome: AuditEventRecord['outcome'];
  readonly correlationId: string;
  readonly requestId: string | null;
  readonly ipHash: string | null;
  readonly userAgentHash: string | null;
  readonly dataBefore: Record<string, unknown> | null;
  readonly dataAfter: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;
  readonly occurredAt: Date;
  readonly hashPrev: string;
  readonly hashSelf: string;
  readonly expiresAt: Date | null;
}

export interface AuditEventFilter {
  readonly action?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly correlationId?: string;
  readonly outcome?: AuditEventRecord['outcome'];
  readonly occurredAfter?: Date;
  readonly occurredBefore?: Date;
}

export interface AuditEventRepository {
  /** Append-only. There is deliberately no update or delete. */
  append(input: AppendAuditEventInput, scope: TransactionScope): Promise<AuditEventRecord>;

  /**
   * Reads the current chain head. Must be called with the chain's advisory lock held, or two
   * concurrent writers will read the same head and collide on the sequence.
   */
  findChainHead(chainKey: string, scope: TransactionScope): Promise<AuditEventRecord | null>;

  list(
    organizationId: string,
    filter: AuditEventFilter,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<AuditEventRecord>>;

  /** Streams a chain in sequence order for verification. */
  listChainAscending(
    chainKey: string,
    fromSequence: bigint,
    limit: number,
    scope?: TransactionScope,
  ): Promise<readonly AuditEventRecord[]>;

  countForChain(chainKey: string, scope?: TransactionScope): Promise<number>;
}

// ---------------------------------------------------------------------------
// Durable eventing
// ---------------------------------------------------------------------------

export interface EnqueueOutboxEventInput {
  readonly id: string;
  readonly organizationId: string | null;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly expiresAt: Date | null;
}

export interface OutboxRepository {
  /**
   * Writes an event inside the caller's transaction. The scope is mandatory: an outbox row
   * committed separately from its business change defeats the purpose of the pattern.
   */
  enqueue(input: EnqueueOutboxEventInput, scope: TransactionScope): Promise<OutboxEventRecord>;

  /**
   * Claims a batch for publication using `FOR UPDATE SKIP LOCKED`, so several workers can
   * drain the table concurrently without processing the same row twice.
   */
  claimBatch(input: {
    readonly limit: number;
    readonly claimToken: string;
    readonly now: Date;
    /** Rows claimed before this instant are reclaimed, covering a crashed worker. */
    readonly reclaimBefore: Date;
  }): Promise<readonly OutboxEventRecord[]>;

  markPublished(id: string, publishedAt: Date): Promise<void>;

  /** Records a failed attempt and schedules the retry. */
  markFailed(input: {
    readonly id: string;
    readonly error: string;
    readonly availableAt: Date;
  }): Promise<OutboxEventRecord>;

  /** Moves an event out of the retry cycle after exhausting its attempts. */
  markDeadLettered(id: string, error: string): Promise<OutboxEventRecord>;

  countByStatus(): Promise<Readonly<Record<string, number>>>;

  /** Removes published rows past their expiry, keeping the table from growing without bound. */
  deletePublishedBefore(before: Date, limit: number): Promise<number>;
}

export interface InboxRepository {
  /**
   * Records that a message has been handled. Returns false when the identifier was already
   * present, which is how a consumer detects a duplicate delivery.
   */
  tryRecord(
    input: {
      readonly id: string;
      readonly source: string;
      readonly externalId: string;
      readonly eventType: string;
      readonly correlationId: string | null;
      readonly expiresAt: Date | null;
    },
    scope?: TransactionScope,
  ): Promise<boolean>;

  find(source: string, externalId: string, scope?: TransactionScope): Promise<InboxEventRecord | null>;

  deleteExpired(before: Date, limit: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export type IdempotencyClaim =
  | { readonly outcome: 'CLAIMED'; readonly record: IdempotencyRecord }
  | { readonly outcome: 'REPLAY'; readonly record: IdempotencyRecord }
  | { readonly outcome: 'IN_PROGRESS'; readonly record: IdempotencyRecord }
  | { readonly outcome: 'MISMATCH'; readonly record: IdempotencyRecord };

export interface IdempotencyRepository {
  /**
   * Atomically claims a key or reports what already exists.
   *
   * The four outcomes are what the HTTP layer needs to behave correctly: proceed, replay the
   * stored response, tell the caller to retry shortly, or refuse a key reused with a
   * different body.
   */
  claim(input: {
    readonly id: string;
    readonly organizationId: string;
    readonly scopeName: string;
    readonly key: string;
    readonly requestHash: string;
    readonly correlationId: string;
    readonly expiresAt: Date;
  }): Promise<IdempotencyClaim>;

  complete(input: {
    readonly id: string;
    readonly responseStatus: number;
    readonly responseBody: Record<string, unknown>;
    readonly completedAt: Date;
  }): Promise<void>;

  /** Releases a claim whose request failed, so the caller may retry with the same key. */
  release(id: string): Promise<void>;

  deleteExpired(before: Date, limit: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface CreateRetentionPolicyInput {
  readonly id: string;
  readonly organizationId: string | null;
  readonly resourceType: string;
  readonly purpose: Purpose;
  readonly retentionSeconds: number;
  readonly action: RetentionAction;
  readonly legalBasis: string;
  readonly version: number;
  readonly createdBy: string | null;
}

export interface RetentionRepository {
  createPolicy(
    input: CreateRetentionPolicyInput,
    scope?: TransactionScope,
  ): Promise<RetentionPolicyRecord>;

  /**
   * Resolves the policy that governs a resource: the tenant's own override when present,
   * otherwise the platform default.
   */
  resolvePolicy(
    organizationId: string | null,
    resourceType: string,
    purpose: Purpose,
    scope?: TransactionScope,
  ): Promise<RetentionPolicyRecord | null>;

  listActivePolicies(scope?: TransactionScope): Promise<readonly RetentionPolicyRecord[]>;

  listPoliciesForOrganization(
    organizationId: string | null,
    scope?: TransactionScope,
  ): Promise<readonly RetentionPolicyRecord[]>;

  startRun(
    input: {
      readonly id: string;
      readonly retentionPolicyId: string;
      readonly correlationId: string;
    },
    scope?: TransactionScope,
  ): Promise<RetentionRunRecord>;

  finishRun(
    input: {
      readonly id: string;
      readonly recordsAffected: number;
      readonly proofHash: string;
      readonly finishedAt: Date;
    },
    scope?: TransactionScope,
  ): Promise<RetentionRunRecord>;

  failRun(
    input: { readonly id: string; readonly error: string; readonly finishedAt: Date },
    scope?: TransactionScope,
  ): Promise<RetentionRunRecord>;

  listRuns(
    retentionPolicyId: string,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<RetentionRunRecord>>;
}
