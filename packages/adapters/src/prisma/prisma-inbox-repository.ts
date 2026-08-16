import type { InboxEventRecord, InboxRepository, TransactionScope } from '@sentra/ports';
import type { PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

/**
 * Consumer-side deduplication (slide 034). A handler records the `(source, externalId)` pair
 * it has processed; the unique constraint on that pair is what makes at-least-once delivery
 * safe without every handler being individually clever.
 *
 * {@link tryRecord} enlists in the caller's transaction so the "mark processed" write commits
 * atomically with the handler's side effect: either both land or neither does, which is what
 * makes a duplicate delivery a no-op rather than a repeated effect.
 */
export class PrismaInboxRepository implements InboxRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  public async tryRecord(
    input: {
      readonly id: string;
      readonly source: string;
      readonly externalId: string;
      readonly eventType: string;
      readonly correlationId: string | null;
      readonly expiresAt: Date | null;
    },
    scope?: TransactionScope,
  ): Promise<boolean> {
    const tx = scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
    try {
      await tx.inboxEvent.create({
        data: {
          id: input.id,
          source: input.source,
          externalId: input.externalId,
          eventType: input.eventType,
          correlationId: input.correlationId,
          expiresAt: input.expiresAt,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  public async find(
    source: string,
    externalId: string,
    scope?: TransactionScope,
  ): Promise<InboxEventRecord | null> {
    const tx = scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
    const row = await tx.inboxEvent.findUnique({
      where: { source_externalId: { source, externalId } },
    });
    return row === null ? null : { ...row };
  }

  public async deleteExpired(before: Date, limit: number): Promise<number> {
    const stale = await this.prisma.inboxEvent.findMany({
      where: { expiresAt: { not: null, lt: before } },
      select: { id: true },
      take: limit,
    });
    if (stale.length === 0) {
      return 0;
    }
    const deleted = await this.prisma.inboxEvent.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    return deleted.count;
  }
}

/** Prisma raises P2002 on a unique-constraint violation. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

export const createPrismaInboxRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaInboxRepository => new PrismaInboxRepository(prisma, unitOfWork);
