import type {
  ApiKeyRecord,
  ApiKeyRepository,
  CreateApiKeyInput,
  TransactionScope,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type ApiKeyRow = Prisma.ApiKeyGetPayload<Record<string, never>>;

const toRecord = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  environment: row.environment,
  name: row.name,
  publishableKey: row.publishableKey,
  secretHash: row.secretHash,
  secretLast4: row.secretLast4,
  status: row.status,
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
  createdBy: row.createdBy,
  revokedAt: row.revokedAt,
});

export class PrismaApiKeyRepository implements ApiKeyRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(input: CreateApiKeyInput, scope?: TransactionScope): Promise<ApiKeyRecord> {
    const row = await this.exec(scope).apiKey.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        environment: input.environment,
        name: input.name,
        publishableKey: input.publishableKey,
        secretHash: input.secretHash,
        secretLast4: input.secretLast4,
        createdBy: input.createdBy,
        correlationId: input.correlationId,
      },
    });
    return toRecord(row);
  }

  public async findById(id: string, scope?: TransactionScope): Promise<ApiKeyRecord | null> {
    const row = await this.exec(scope).apiKey.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  public async findByPublishableKey(
    publishableKey: string,
    scope?: TransactionScope,
  ): Promise<ApiKeyRecord | null> {
    const row = await this.exec(scope).apiKey.findUnique({ where: { publishableKey } });
    return row === null ? null : toRecord(row);
  }

  public async listForOrganization(
    organizationId: string,
    scope?: TransactionScope,
  ): Promise<readonly ApiKeyRecord[]> {
    const rows = await this.exec(scope).apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  public async revoke(
    id: string,
    revokedAt: Date,
    scope?: TransactionScope,
  ): Promise<ApiKeyRecord> {
    const row = await this.exec(scope).apiKey.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt },
    });
    return toRecord(row);
  }
}

export const createPrismaApiKeyRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaApiKeyRepository => new PrismaApiKeyRepository(prisma, unitOfWork);
