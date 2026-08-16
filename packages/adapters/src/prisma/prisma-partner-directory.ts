import type {
  Pagination,
  PagedResult,
  PartnerConnectionRecord,
  PartnerDirectoryReadModel,
} from '@sentra/ports';
import type { OrganizationStatus, OrganizationType } from '@sentra/contracts';
import type { PrismaClient } from '@sentra/db';
import { fromPrismaScopes } from './partner-scope-map';

export class PrismaPartnerDirectory implements PartnerDirectoryReadModel {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listConnections(
    filter: {
      readonly organizationId?: string;
      readonly kind?: PartnerConnectionRecord['kind'];
      readonly status?: PartnerConnectionRecord['status'];
      readonly environment?: PartnerConnectionRecord['environment'];
    },
    pagination: Pagination,
  ): Promise<PagedResult<PartnerConnectionRecord>> {
    const rows = await this.prisma.partnerConnection.findMany({
      where: {
        ...(filter.organizationId === undefined ? {} : { organizationId: filter.organizationId }),
        ...(filter.kind === undefined ? {} : { kind: filter.kind }),
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.environment === undefined ? {} : { environment: filter.environment }),
        ...(pagination.cursor === undefined ? {} : { id: { lt: pagination.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: pagination.limit + 1,
    });
    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    const items: PartnerConnectionRecord[] = page.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      kind: row.kind,
      environment: row.environment,
      clientId: row.clientId,
      scopes: fromPrismaScopes(row.scopes),
      allowedPurposes: row.allowedPurposes,
      ipAllowlist: row.ipAllowlist,
      tokenTtlSeconds: row.tokenTtlSeconds,
      status: row.status,
      lastRotatedAt: row.lastRotatedAt,
      lastUsedAt: row.lastUsedAt,
      rotationDueAt: row.rotationDueAt,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
    const next = hasMore ? items[items.length - 1]?.id : undefined;
    return next === undefined ? { items } : { items, nextCursor: next };
  }

  public async organizationLabels(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, slug: true },
    });
    return new Map(rows.map((row) => [row.id, row.slug]));
  }

  public async organizationById(id: string): Promise<{
    readonly id: string;
    readonly slug: string;
    readonly type: OrganizationType;
    readonly status: OrganizationStatus;
  } | null> {
    const row = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, type: true, status: true },
    });
    return row;
  }

  public async listOrganizationsByType(
    type: OrganizationType,
  ): Promise<readonly { id: string; slug: string }[]> {
    return this.prisma.organization.findMany({
      where: { type, status: 'ACTIVE' },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
  }
}

export const createPrismaPartnerDirectory = (prisma: PrismaClient): PrismaPartnerDirectory =>
  new PrismaPartnerDirectory(prisma);
