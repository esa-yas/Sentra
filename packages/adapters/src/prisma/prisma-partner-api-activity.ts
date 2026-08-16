import type {
  Pagination,
  PagedResult,
  PartnerApiActivityFilter,
  PartnerApiActivityStore,
  PartnerApiRequestRecord,
  PartnerCheckResult,
  RecordPartnerApiRequestInput,
} from '@sentra/ports';
import type { PrismaClient } from '@sentra/db';

const toRecord = (row: {
  id: string;
  organizationId: string | null;
  partnerConnectionId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  correlationId: string;
  authentication: string;
  signature: string;
  replay: string;
  idempotency: string;
  rateLimit: string;
  errorCode: string | null;
  environment: string;
  synthetic: boolean;
  occurredAt: Date;
}): PartnerApiRequestRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  partnerConnectionId: row.partnerConnectionId,
  endpoint: row.endpoint,
  method: row.method,
  statusCode: row.statusCode,
  durationMs: row.durationMs,
  correlationId: row.correlationId,
  authentication: row.authentication as PartnerCheckResult,
  signature: row.signature as PartnerCheckResult,
  replay: row.replay as PartnerCheckResult,
  idempotency: row.idempotency as PartnerCheckResult,
  rateLimit: row.rateLimit as PartnerCheckResult,
  errorCode: row.errorCode,
  environment: row.environment as PartnerApiRequestRecord['environment'],
  synthetic: row.synthetic,
  occurredAt: row.occurredAt,
});

export class PrismaPartnerApiActivityStore implements PartnerApiActivityStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async record(input: RecordPartnerApiRequestInput): Promise<void> {
    await this.prisma.partnerApiRequest.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        partnerConnectionId: input.partnerConnectionId,
        endpoint: input.endpoint,
        method: input.method,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        correlationId: input.correlationId,
        authentication: input.authentication,
        signature: input.signature,
        replay: input.replay,
        idempotency: input.idempotency,
        rateLimit: input.rateLimit,
        errorCode: input.errorCode,
        environment: input.environment,
        synthetic: input.synthetic,
        occurredAt: input.occurredAt,
      },
    });
  }

  public async list(
    filter: PartnerApiActivityFilter,
    pagination: Pagination,
  ): Promise<PagedResult<PartnerApiRequestRecord>> {
    const rows = await this.prisma.partnerApiRequest.findMany({
      where: {
        ...(filter.organizationId === undefined ? {} : { organizationId: filter.organizationId }),
        ...(filter.partnerConnectionId === undefined
          ? {}
          : { partnerConnectionId: filter.partnerConnectionId }),
        ...(filter.endpoint === undefined ? {} : { endpoint: filter.endpoint }),
        ...(filter.method === undefined ? {} : { method: filter.method }),
        ...(filter.statusCode === undefined ? {} : { statusCode: filter.statusCode }),
        ...(filter.correlationId === undefined ? {} : { correlationId: filter.correlationId }),
        ...(filter.environment === undefined ? {} : { environment: filter.environment }),
        ...(pagination.cursor === undefined ? {} : { id: { lt: pagination.cursor } }),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });
    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(toRecord);
    const next = hasMore ? items[items.length - 1]?.id : undefined;
    return next === undefined ? { items } : { items, nextCursor: next };
  }

  public async recentFailureCount(partnerConnectionId: string, since: Date): Promise<number> {
    return this.prisma.partnerApiRequest.count({
      where: {
        partnerConnectionId,
        occurredAt: { gte: since },
        statusCode: { gte: 400 },
      },
    });
  }
}

export const createPrismaPartnerApiActivityStore = (
  prisma: PrismaClient,
): PrismaPartnerApiActivityStore => new PrismaPartnerApiActivityStore(prisma);
