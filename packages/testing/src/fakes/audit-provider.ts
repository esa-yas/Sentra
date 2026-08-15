import {
  AUDIT_HASH_GENESIS,
  auditChainKeyFor,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
} from '@sentra/contracts';
import type { AuditRecordInput, AuditProvider, RecordedAuditEvent, TransactionScope } from '@sentra/ports';
import type { FakeIdGenerator } from './id-generator';
import { createFakeIdGenerator } from './id-generator';
import type { FakeUnitOfWork } from './unit-of-work';

interface StoredAuditEvent extends AuditRecordInput {
  readonly id: string;
  readonly chainKey: string;
  readonly sequence: bigint;
  readonly hashPrev: string;
  readonly hashSelf: string;
  readonly occurredAt: Date;
}

/**
 * In-memory audit provider with a per-tenant hash chain. Records staged inside a
 * transaction commit with the surrounding unit of work; standalone records commit
 * immediately.
 */
export class FakeAuditProvider implements AuditProvider {
  private readonly committed: StoredAuditEvent[] = [];
  private readonly stagedByScope = new Map<string, StoredAuditEvent[]>();
  private readonly sequences = new Map<string, bigint>();
  private readonly reservedByScope = new Map<string, StoredAuditEvent[]>();

  public constructor(
    private readonly ids: FakeIdGenerator = createFakeIdGenerator(),
    private readonly unitOfWork?: FakeUnitOfWork,
  ) {}

  public readonly events = (): readonly StoredAuditEvent[] => [...this.committed];

  public async record(input: AuditRecordInput, scope: TransactionScope): Promise<RecordedAuditEvent> {
    this.unitOfWork?.assertScopeActive(scope);
    const event = this.buildEvent(input);

    const append = (): void => {
      this.committed.push(event);
    };

    if (this.unitOfWork !== undefined) {
      this.unitOfWork.coordinator.stage(scope.scopeId, {
        commit: append,
        rollback: () => {
          this.sequences.set(event.chainKey, (this.sequences.get(event.chainKey) ?? 1n) - 1n);
          const reserved = this.reservedByScope.get(scope.scopeId) ?? [];
          this.reservedByScope.set(
            scope.scopeId,
            reserved.filter((entry) => entry.id !== event.id),
          );
        },
      });
      const reserved = this.reservedByScope.get(scope.scopeId) ?? [];
      reserved.push(event);
      this.reservedByScope.set(scope.scopeId, reserved);
    } else {
      const bucket = this.stagedByScope.get(scope.scopeId) ?? [];
      bucket.push(event);
      this.stagedByScope.set(scope.scopeId, bucket);
    }

    return this.toRecorded(event);
  }

  public async recordStandalone(input: AuditRecordInput): Promise<RecordedAuditEvent> {
    const event = this.buildEvent(input);
    this.committed.push(event);
    return this.toRecorded(event);
  }

  public commitScope(scopeId: string): void {
    const staged = this.stagedByScope.get(scopeId) ?? [];
    this.committed.push(...staged);
    this.stagedByScope.delete(scopeId);
  }

  public rollbackScope(scopeId: string): void {
    const staged = this.stagedByScope.get(scopeId) ?? [];
    for (const event of staged) {
      this.sequences.set(event.chainKey, (this.sequences.get(event.chainKey) ?? 1n) - 1n);
    }
    this.stagedByScope.delete(scopeId);
    this.reservedByScope.delete(scopeId);
  }

  private buildEvent(input: AuditRecordInput): StoredAuditEvent {
    const chainKey = auditChainKeyFor(input.organizationId);
    const previous = this.findChainHead(chainKey);
    const nextSequence = (this.sequences.get(chainKey) ?? 0n) + 1n;
    this.sequences.set(chainKey, nextSequence);

    const hashPrev = previous?.hashSelf ?? AUDIT_HASH_GENESIS;
    const occurredAt = input.occurredAt ?? new Date();
    const id = this.ids.generate();

    const canonical: AuditCanonicalEvent = {
      chainKey,
      sequence: nextSequence,
      id,
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      purpose: input.purpose,
      outcome: input.outcome ?? 'ALLOWED',
      correlationId: input.correlationId ?? '',
      requestId: input.requestId ?? null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      occurredAt,
      dataBefore: input.dataBefore ?? null,
      dataAfter: input.dataAfter ?? null,
      metadata: input.metadata ?? null,
    };

    const hashSelf = computeAuditHashSelf(hashPrev, canonical);

    return {
      ...input,
      id,
      chainKey,
      sequence: nextSequence,
      hashPrev,
      hashSelf,
      occurredAt,
      outcome: input.outcome ?? 'ALLOWED',
    };
  }

  private findChainHead(chainKey: string): StoredAuditEvent | undefined {
    const reserved = [...this.reservedByScope.values()]
      .flat()
      .filter((event) => event.chainKey === chainKey);
    const reservedHead = reserved.at(-1);
    if (reservedHead !== undefined) {
      return reservedHead;
    }
    return [...this.committed].reverse().find((event) => event.chainKey === chainKey);
  }

  private toRecorded(event: StoredAuditEvent): RecordedAuditEvent {
    return {
      id: event.id,
      chainKey: event.chainKey,
      sequence: event.sequence,
      hashPrev: event.hashPrev,
      hashSelf: event.hashSelf,
      occurredAt: event.occurredAt,
    };
  }
}

export const createFakeAuditProvider = (options?: {
  readonly ids?: FakeIdGenerator;
  readonly unitOfWork?: FakeUnitOfWork;
}): FakeAuditProvider => new FakeAuditProvider(options?.ids, options?.unitOfWork);
