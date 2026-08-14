import type {
  ActorType,
  AuditAction,
  AuditOutcome,
  Purpose,
  ResourceType,
} from '@sentra/contracts';
import type { TransactionScope } from './unit-of-work';

/**
 * The audit port every module records through.
 *
 * Modules depend on this rather than on the audit module itself, which keeps slide 027's
 * rule intact: no module writes another module's tables. Passing a {@link TransactionScope}
 * is what makes an audit record commit with the change it describes, so a successful
 * business write can never end up unrecorded.
 */
export interface AuditRecordInput {
  /** Null for platform-level actions such as onboarding the first tenant. */
  organizationId: string | null;
  actorType: ActorType;
  actorId?: string | null;
  /** Readable label for the timeline. Must not contain personal data. */
  actorLabel?: string | null;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string | null;
  purpose: Purpose;
  outcome?: AuditOutcome;
  /** Redacted before persistence. Present only where a diff is meaningful. */
  dataBefore?: Record<string, unknown> | null;
  dataAfter?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /** Salted digests, never the raw address or agent string. */
  ipHash?: string | null;
  userAgentHash?: string | null;
  occurredAt?: Date;
}

export interface RecordedAuditEvent {
  id: string;
  chainKey: string;
  sequence: bigint;
  hashPrev: string;
  hashSelf: string;
  occurredAt: Date;
}

export interface AuditProvider {
  /**
   * Appends one record to the tenant's chain. Must be called inside a transaction so the
   * record and the change it describes share a fate.
   */
  record(input: AuditRecordInput, scope: TransactionScope): Promise<RecordedAuditEvent>;

  /**
   * Appends a record in its own transaction. For actions with no business write to join,
   * such as a denied authorization attempt, which must still be recorded.
   */
  recordStandalone(input: AuditRecordInput): Promise<RecordedAuditEvent>;
}
