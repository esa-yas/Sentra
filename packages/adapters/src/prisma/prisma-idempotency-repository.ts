import type {
  IdempotencyClaim,
  IdempotencyRecord,
  IdempotencyRepository,
} from '@sentra/ports';
import { isUniqueConstraintViolation, type Prisma, type PrismaClient } from '@sentra/db';

const toRecord = (row: {
  id: string;
  organizationId: string;
  scope: string;
  key: string;
  requestHash: string;
  status: IdempotencyRecord['status'];
  responseStatus: number | null;
  responseBody: Prisma.JsonValue;
  correlationId: string;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}): IdempotencyRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  scope: row.scope,
  key: row.key,
  requestHash: row.requestHash,
  status: row.status,
  responseStatus: row.responseStatus,
  responseBody: (row.responseBody as Record<string, unknown> | null) ?? null,
  correlationId: row.correlationId,
  createdAt: row.createdAt,
  completedAt: row.completedAt,
  expiresAt: row.expiresAt,
});

export class PrismaIdempotencyRepository implements IdempotencyRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: {
    readonly id: string;
    readonly organizationId: string;
    readonly scopeName: string;
    readonly key: string;
    readonly requestHash: string;
    readonly correlationId: string;
    readonly expiresAt: Date;
  }): Promise<IdempotencyClaim> {
    try {
      const row = await this.prisma.idempotencyKey.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          scope: input.scopeName,
          key: input.key,
          requestHash: input.requestHash,
          status: 'IN_PROGRESS',
          correlationId: input.correlationId,
          expiresAt: input.expiresAt,
        },
      });
      return { outcome: 'CLAIMED', record: toRecord(row) };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        organizationId_scope_key: {
          organizationId: input.organizationId,
          scope: input.scopeName,
          key: input.key,
        },
      },
    });
    if (existing === null) {
      throw new Error('Idempotency row disappeared after a unique conflict.');
    }
    const record = toRecord(existing);
    if (existing.requestHash !== input.requestHash) {
      return { outcome: 'MISMATCH', record };
    }
    if (existing.status === 'IN_PROGRESS') {
      return { outcome: 'IN_PROGRESS', record };
    }
    return { outcome: 'REPLAY', record };
  }

  public async complete(input: {
    readonly id: string;
    readonly responseStatus: number;
    readonly responseBody: Record<string, unknown>;
    readonly completedAt: Date;
  }): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { id: input.id },
      data: {
        status: 'COMPLETED',
        responseStatus: input.responseStatus,
        responseBody: input.responseBody as Prisma.InputJsonValue,
        completedAt: input.completedAt,
      },
    });
  }

  public async release(id: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: { id, status: 'IN_PROGRESS' },
    });
  }

  public async deleteExpired(before: Date, limit: number): Promise<number> {
    const stale = await this.prisma.idempotencyKey.findMany({
      where: { expiresAt: { lt: before } },
      select: { id: true },
      take: limit,
    });
    if (stale.length === 0) {
      return 0;
    }
    const deleted = await this.prisma.idempotencyKey.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    return deleted.count;
  }
}

export const createPrismaIdempotencyRepository = (
  prisma: PrismaClient,
): PrismaIdempotencyRepository => new PrismaIdempotencyRepository(prisma);
