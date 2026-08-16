import type {
  CreatePartnerConnectionInput,
  Pagination,
  PagedResult,
  PartnerConnectionRecord,
  PartnerConnectionRepository,
  PartnerConnectionWithSecret,
  TransactionScope,
} from '@sentra/ports';
import type { PartnerConnectionStatus } from '@sentra/contracts';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';
import { fromPrismaScopes, toPrismaScopes } from './partner-scope-map';

type ConnectionRow = Prisma.PartnerConnectionGetPayload<object>;

const toRecord = (row: ConnectionRow): PartnerConnectionRecord => ({
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
});

export class PrismaPartnerConnectionRepository implements PartnerConnectionRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(
    input: CreatePartnerConnectionInput,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord> {
    const row = await this.exec(scope).partnerConnection.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        name: input.name,
        kind: input.kind,
        environment: input.environment,
        clientId: input.clientId,
        clientSecretHash: input.clientSecretHash,
        scopes: toPrismaScopes(input.scopes),
        allowedPurposes: [...input.allowedPurposes],
        ipAllowlist: [...input.ipAllowlist],
        tokenTtlSeconds: input.tokenTtlSeconds,
        rotationDueAt: input.rotationDueAt,
        createdBy: input.createdBy,
        source: input.source,
        correlationId: input.correlationId,
      },
    });
    return toRecord(row);
  }

  public async findById(
    organizationId: string,
    id: string,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord | null> {
    const row = await this.exec(scope).partnerConnection.findFirst({
      where: { id, organizationId },
    });
    return row === null ? null : toRecord(row);
  }

  public async findByIdUnscoped(
    id: string,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord | null> {
    const row = await this.exec(scope).partnerConnection.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  public async findByClientIdWithSecret(
    clientId: string,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionWithSecret | null> {
    const row = await this.exec(scope).partnerConnection.findUnique({ where: { clientId } });
    return row === null ? null : { ...toRecord(row), clientSecretHash: row.clientSecretHash };
  }

  public async listForOrganization(
    organizationId: string,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<PartnerConnectionRecord>> {
    const rows = await this.exec(scope).partnerConnection.findMany({
      where: {
        organizationId,
        ...(pagination.cursor === undefined ? {} : { id: { lt: pagination.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: pagination.limit + 1,
    });
    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(toRecord);
    const next = hasMore ? items[items.length - 1]?.id : undefined;
    return next === undefined ? { items } : { items, nextCursor: next };
  }

  public async rotateSecret(
    organizationId: string,
    id: string,
    clientSecretHash: string,
    rotatedAt: Date,
    rotationDueAt: Date | null,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord> {
    const existing = await this.findById(organizationId, id, scope);
    if (existing === null) {
      throw new Error('Partner connection was not found.');
    }
    const row = await this.exec(scope).partnerConnection.update({
      where: { id },
      data: { clientSecretHash, lastRotatedAt: rotatedAt, rotationDueAt },
    });
    return toRecord(row);
  }

  public async updateStatus(
    organizationId: string,
    id: string,
    status: PartnerConnectionStatus,
    scope?: TransactionScope,
  ): Promise<PartnerConnectionRecord> {
    const existing = await this.findById(organizationId, id, scope);
    if (existing === null) {
      throw new Error('Partner connection was not found.');
    }
    const row = await this.exec(scope).partnerConnection.update({
      where: { id },
      data: { status },
    });
    return toRecord(row);
  }

  public async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.partnerConnection.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}

export const createPrismaPartnerConnectionRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaPartnerConnectionRepository => new PrismaPartnerConnectionRepository(prisma, unitOfWork);
