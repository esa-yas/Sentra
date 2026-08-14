import {
  AUDIT_HASH_GENESIS,
  AUDIT_OUTCOMES,
  auditChainKeyFor,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
} from '@sentra/contracts';
import type {
  AuditProvider,
  AuditRecordInput,
  Clock,
  IdGenerator,
  RecordedAuditEvent,
  TransactionScope,
} from '@sentra/ports';
import type { InMemoryUnitOfWork } from './in-memory-unit-of-work';

/**
 * In-memory audit provider with a per-tenant hash chain, for the Version 1a in-memory
 * provider mode. It produces the same canonical `hashSelf` digests the Postgres adapter
 * must produce in Slice 2, because both compute them through the one shared
 * {@link computeAuditHashSelf} in `@sentra/contracts` — there is no second hash algorithm.
 */
interface StoredAuditEvent {
  readonly canonical: AuditCanonicalEvent;
  readonly recorded: RecordedAuditEvent;
  readonly action: string;
}

export class InMemoryAuditProvider implements AuditProvider {
  private readonly committed: StoredAuditEvent[] = [];
  private readonly reservedByScope = new Map<string, StoredAuditEvent[]>();
  private readonly sequences = new Map<string, bigint>();

  public constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly unitOfWork: InMemoryUnitOfWork,
  ) {}

  public list(): readonly StoredAuditEvent[] {
    return [...this.committed];
  }

  public async record(input: AuditRecordInput, scope: TransactionScope): Promise<RecordedAuditEvent> {
    this.unitOfWork.assertScopeActive(scope);
    const event = this.buildEvent(input);

    const reserved = this.reservedByScope.get(scope.scopeId) ?? [];
    reserved.push(event);
    this.reservedByScope.set(scope.scopeId, reserved);

    this.unitOfWork.stage(scope, {
      commit: () => {
        this.committed.push(event);
        this.clearReserved(scope.scopeId, event);
      },
      rollback: () => {
        this.sequences.set(
          event.canonical.chainKey,
          (this.sequences.get(event.canonical.chainKey) ?? 1n) - 1n,
        );
        this.clearReserved(scope.scopeId, event);
      },
    });

    return event.recorded;
  }

  public async recordStandalone(input: AuditRecordInput): Promise<RecordedAuditEvent> {
    const event = this.buildEvent(input);
    this.committed.push(event);
    return event.recorded;
  }

  private clearReserved(scopeId: string, event: StoredAuditEvent): void {
    const reserved = this.reservedByScope.get(scopeId);
    if (reserved === undefined) {
      return;
    }
    const next = reserved.filter((entry) => entry !== event);
    if (next.length === 0) {
      this.reservedByScope.delete(scopeId);
    } else {
      this.reservedByScope.set(scopeId, next);
    }
  }

  private chainHead(chainKey: string): StoredAuditEvent | undefined {
    for (const reserved of this.reservedByScope.values()) {
      const match = [...reserved].reverse().find((entry) => entry.canonical.chainKey === chainKey);
      if (match !== undefined) {
        return match;
      }
    }
    return [...this.committed].reverse().find((entry) => entry.canonical.chainKey === chainKey);
  }

  private buildEvent(input: AuditRecordInput): StoredAuditEvent {
    const chainKey = auditChainKeyFor(input.organizationId);
    const previous = this.chainHead(chainKey);
    const sequence = (this.sequences.get(chainKey) ?? 0n) + 1n;
    this.sequences.set(chainKey, sequence);

    const hashPrev = previous?.recorded.hashSelf ?? AUDIT_HASH_GENESIS;
    const occurredAt = input.occurredAt ?? this.clock.now();
    const id = this.ids.generateAt(occurredAt);

    const canonical: AuditCanonicalEvent = {
      chainKey,
      sequence,
      id,
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      purpose: input.purpose,
      outcome: input.outcome ?? AUDIT_OUTCOMES.ALLOWED,
      correlationId: '',
      requestId: null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      occurredAt,
      dataBefore: input.dataBefore ?? null,
      dataAfter: input.dataAfter ?? null,
      metadata: input.metadata ?? null,
    };

    const hashSelf = computeAuditHashSelf(hashPrev, canonical);

    return {
      canonical,
      action: input.action,
      recorded: {
        id,
        chainKey,
        sequence,
        hashPrev,
        hashSelf,
        occurredAt,
      },
    };
  }
}

export const createInMemoryAuditProvider = (
  ids: IdGenerator,
  clock: Clock,
  unitOfWork: InMemoryUnitOfWork,
): InMemoryAuditProvider => new InMemoryAuditProvider(ids, clock, unitOfWork);
