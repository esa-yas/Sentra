import type {
  OutboxEventRecord,
  OutboxListFilter,
  OutboxStatusCounts,
  Pagination,
  PagedResult,
  QueueOutboxReadModel,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';

/**
 * PostgreSQL projection of the outbox for the Queue Monitor. A dedicated read surface, not a
 * raw table dump: it exposes only what the console renders and never mutates the publisher's
 * claim lifecycle beyond the explicit, development-only {@link resetToPending} action.
 */
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

export class PostgresQueueStore implements QueueOutboxReadModel {
  public constructor(private readonly prisma: PrismaClient) {}

  private whereFrom(filter: OutboxListFilter): Prisma.OutboxEventWhereInput {
    const where: Prisma.OutboxEventWhereInput = {};
    if (filter.status !== undefined) {
      where.status = filter.status;
    }
    if (filter.eventType !== undefined) {
      where.eventType = filter.eventType;
    }
    if (filter.correlationId !== undefined) {
      where.correlationId = filter.correlationId;
    }
    if (filter.createdAfter !== undefined || filter.createdBefore !== undefined) {
      where.createdAt = {
        ...(filter.createdAfter !== undefined ? { gte: filter.createdAfter } : {}),
        ...(filter.createdBefore !== undefined ? { lte: filter.createdBefore } : {}),
      };
    }
    return where;
  }

  public async listOutbox(
    filter: OutboxListFilter,
    pagination: Pagination,
  ): Promise<PagedResult<OutboxEventRecord>> {
    const limit = Math.min(Math.max(1, pagination.limit), 100);
    const where = this.whereFrom(filter);
    const rows = await this.prisma.outboxEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(pagination.cursor === undefined ? {} : { cursor: { id: pagination.cursor }, skip: 1 }),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const result: PagedResult<OutboxEventRecord> = { items: page.map(toRecord) };
    if (hasMore) {
      const last = page[page.length - 1];
      if (last !== undefined) {
        return { ...result, nextCursor: last.id };
      }
    }
    return result;
  }

  public async getOutbox(eventId: string): Promise<OutboxEventRecord | null> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    return row === null ? null : toRecord(row);
  }

  public async statusCounts(): Promise<OutboxStatusCounts> {
    const groups = await this.prisma.outboxEvent.groupBy({ by: ['status'], _count: true });
    const counts: OutboxStatusCounts = {
      pending: 0,
      publishing: 0,
      published: 0,
      failed: 0,
      deadLetter: 0,
    };
    const map: Record<string, keyof OutboxStatusCounts> = {
      PENDING: 'pending',
      PUBLISHING: 'publishing',
      PUBLISHED: 'published',
      FAILED: 'failed',
      DEAD_LETTER: 'deadLetter',
    };
    const mutable = { ...counts };
    for (const group of groups) {
      const key = map[group.status];
      if (key !== undefined) {
        mutable[key] = group._count;
      }
    }
    return mutable;
  }

  public async oldestPendingAgeMs(now: Date): Promise<number | null> {
    const oldest = await this.prisma.outboxEvent.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (oldest === null) {
      return null;
    }
    return Math.max(0, now.getTime() - oldest.createdAt.getTime());
  }

  public async organizationLabels(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: unique } },
      select: { id: true, slug: true },
    });
    return new Map(rows.map((row) => [row.id, row.slug]));
  }

  public async resetToPending(eventId: string, now: Date): Promise<OutboxEventRecord | null> {
    const existing = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (existing === null) {
      return null;
    }
    const row = await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'PENDING', availableAt: now, claimedAt: null, claimToken: null, lastError: null },
    });
    return toRecord(row);
  }
}

export const createPostgresQueueStore = (prisma: PrismaClient): PostgresQueueStore =>
  new PostgresQueueStore(prisma);
