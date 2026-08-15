import {
  AUDIT_HASH_GENESIS,
  AUDIT_OUTCOMES,
  auditChainKeyFor,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
} from '@sentra/contracts';
import { Prisma } from '@sentra/db';
import type {
  AuditProvider,
  AuditRecordInput,
  Clock,
  IdGenerator,
  RecordedAuditEvent,
  TransactionScope,
} from '@sentra/ports';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

const jsonOrNull = (value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/**
 * Hash-chained audit append using canonical v1 from `@sentra/contracts`.
 *
 * Transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock`) keyed by
 * `audit:<chainKey>`. Re-locking the same key in one transaction is a no-op so multiple
 * audit appends can share one chain-head lock. The unique `(chainKey, sequence)` constraint
 * remains a backstop against forks.
 */
export class PrismaAuditProvider implements AuditProvider {
  public constructor(
    private readonly unitOfWork: PrismaUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async record(input: AuditRecordInput, scope: TransactionScope): Promise<RecordedAuditEvent> {
    const tx = this.unitOfWork.executor(scope);
    const chainKey = auditChainKeyFor(input.organizationId);
    await this.unitOfWork.lock(scope, `audit:${chainKey}`);

    const head = await tx.auditEvent.findFirst({
      where: { chainKey },
      orderBy: { sequence: 'desc' },
    });

    const sequence = (head?.sequence ?? 0n) + 1n;
    const hashPrev = head?.hashSelf ?? AUDIT_HASH_GENESIS;
    const occurredAt = input.occurredAt ?? this.clock.now();
    const id = this.ids.generateAt(occurredAt);
    const correlationId = input.correlationId ?? '';
    const requestId = input.requestId ?? null;
    const outcome = input.outcome ?? AUDIT_OUTCOMES.ALLOWED;

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
      outcome,
      correlationId,
      requestId,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      occurredAt,
      dataBefore: input.dataBefore ?? null,
      dataAfter: input.dataAfter ?? null,
      metadata: input.metadata ?? null,
    };

    const hashSelf = computeAuditHashSelf(hashPrev, canonical);

    await tx.auditEvent.create({
      data: {
        id,
        chainKey,
        sequence,
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        purpose: input.purpose,
        outcome,
        correlationId,
        requestId,
        ipHash: input.ipHash ?? null,
        userAgentHash: input.userAgentHash ?? null,
        dataBefore: jsonOrNull(input.dataBefore),
        dataAfter: jsonOrNull(input.dataAfter),
        metadata: jsonOrNull(input.metadata),
        occurredAt,
        hashPrev,
        hashSelf,
      },
    });

    return { id, chainKey, sequence, hashPrev, hashSelf, occurredAt };
  }

  public async recordStandalone(input: AuditRecordInput): Promise<RecordedAuditEvent> {
    return this.unitOfWork.run(async (scope) => this.record(input, scope));
  }
}

export const createPrismaAuditProvider = (
  unitOfWork: PrismaUnitOfWork,
  ids: IdGenerator,
  clock: Clock,
): PrismaAuditProvider => new PrismaAuditProvider(unitOfWork, ids, clock);
