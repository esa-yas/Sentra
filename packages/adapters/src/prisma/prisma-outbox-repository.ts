import { redact } from '@sentra/observability';
import type { EnqueueOutboxEventInput, OutboxEventRecord, OutboxRepository, TransactionScope } from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

const toRecord = (row: {
  id: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: Prisma.JsonValue;
  correlationId: string;
  status: OutboxEventRecord['status'];
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  claimedAt: Date | null;
  claimToken: string | null;
  publishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}): OutboxEventRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  aggregateType: row.aggregateType,
  aggregateId: row.aggregateId,
  eventType: row.eventType,
  schemaVersion: row.schemaVersion,
  payload: (row.payload as Record<string, unknown> | null) ?? {},
  correlationId: row.correlationId,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  availableAt: row.availableAt,
  claimedAt: row.claimedAt,
  claimToken: row.claimToken,
  publishedAt: row.publishedAt,
  lastError: row.lastError,
  createdAt: row.createdAt,
});

export class PrismaOutboxRepository implements OutboxRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  public async enqueue(input: EnqueueOutboxEventInput, scope: TransactionScope): Promise<OutboxEventRecord> {
    const tx = this.unitOfWork.executor(scope);
    const payload = redact(input.payload) as Record<string, unknown>;
    const row = await tx.outboxEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion,
        payload: payload as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        maxAttempts: input.maxAttempts,
        availableAt: input.availableAt,
        expiresAt: input.expiresAt,
      },
    });
    return toRecord(row);
  }

  public async claimBatch(input: {
    readonly limit: number;
    readonly claimToken: string;
    readonly now: Date;
    readonly reclaimBefore: Date;
  }): Promise<readonly OutboxEventRecord[]> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM outbox_events
        WHERE (
          (status = 'PENDING' AND "availableAt" <= ${input.now})
          OR (status = 'PUBLISHING' AND "claimedAt" IS NOT NULL AND "claimedAt" < ${input.reclaimBefore})
        )
        ORDER BY "availableAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      `;
      if (rows.length === 0) {
        return [];
      }
      const ids = rows.map((row) => row.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PUBLISHING', claimedAt: input.now, claimToken: input.claimToken },
      });
      return tx.outboxEvent.findMany({ where: { id: { in: ids } } });
    });
    return claimed.map(toRecord);
  }

  public async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt, claimToken: null },
    });
  }

  public async markFailed(input: {
    readonly id: string;
    readonly error: string;
    readonly availableAt: Date;
  }): Promise<OutboxEventRecord> {
    const row = await this.prisma.outboxEvent.update({
      where: { id: input.id },
      data: {
        status: 'FAILED',
        lastError: input.error,
        availableAt: input.availableAt,
        attempts: { increment: 1 },
        claimToken: null,
        claimedAt: null,
      },
    });
    return toRecord(row);
  }

  public async markDeadLettered(id: string, error: string): Promise<OutboxEventRecord> {
    const row = await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'DEAD_LETTER', lastError: error, claimToken: null },
    });
    return toRecord(row);
  }

  public async countByStatus(): Promise<Readonly<Record<string, number>>> {
    const groups = await this.prisma.outboxEvent.groupBy({ by: ['status'], _count: true });
    const result: Record<string, number> = {};
    for (const group of groups) {
      result[group.status] = group._count;
    }
    return result;
  }

  public async deletePublishedBefore(before: Date, limit: number): Promise<number> {
    const stale = await this.prisma.outboxEvent.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lt: before } },
      select: { id: true },
      take: limit,
    });
    if (stale.length === 0) {
      return 0;
    }
    const deleted = await this.prisma.outboxEvent.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    return deleted.count;
  }
}

export const createPrismaOutboxRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaOutboxRepository => new PrismaOutboxRepository(prisma, unitOfWork);
