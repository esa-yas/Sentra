import type {
  PartnerSigningKeyRecord,
  PartnerSigningKeyRepository,
  RegisterSigningKeyInput,
  TransactionScope,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type KeyRow = Prisma.PartnerSigningKeyGetPayload<{ include: { partnerConnection: true } }>;

const toRecord = (row: KeyRow): PartnerSigningKeyRecord => ({
  id: row.id,
  partnerConnectionId: row.partnerConnectionId,
  organizationId: row.partnerConnection.organizationId,
  kid: row.kid,
  algorithm: row.algorithm,
  publicKeyJwk: (row.publicKeyJwk as Record<string, unknown> | null) ?? {},
  status: row.status,
  notBefore: row.notBefore,
  notAfter: row.notAfter,
  createdAt: row.createdAt,
  revokedAt: row.revokedAt,
  lastUsedAt: row.lastUsedAt,
});

export class PrismaPartnerSigningKeyRepository implements PartnerSigningKeyRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async register(
    input: RegisterSigningKeyInput,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord> {
    const row = await this.exec(scope).partnerSigningKey.create({
      data: {
        id: input.id,
        partnerConnectionId: input.partnerConnectionId,
        kid: input.kid,
        algorithm: input.algorithm,
        publicKeyJwk: input.publicKeyJwk as Prisma.InputJsonValue,
        notBefore: input.notBefore,
        notAfter: input.notAfter,
        createdBy: input.createdBy,
        correlationId: input.correlationId,
      },
      include: { partnerConnection: true },
    });
    return toRecord(row);
  }

  public async findActiveByOrganizationAndKid(
    organizationId: string,
    kid: string,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord | null> {
    const row = await this.exec(scope).partnerSigningKey.findFirst({
      where: {
        kid,
        status: 'ACTIVE',
        partnerConnection: { organizationId },
      },
      include: { partnerConnection: true },
    });
    return row === null ? null : toRecord(row);
  }

  public async findByOrganizationAndKid(
    organizationId: string,
    kid: string,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord | null> {
    const row = await this.exec(scope).partnerSigningKey.findFirst({
      where: { kid, partnerConnection: { organizationId } },
      include: { partnerConnection: true },
    });
    return row === null ? null : toRecord(row);
  }

  public async listForConnection(
    organizationId: string,
    partnerConnectionId: string,
    scope?: TransactionScope,
  ): Promise<readonly PartnerSigningKeyRecord[]> {
    const rows = await this.exec(scope).partnerSigningKey.findMany({
      where: { partnerConnectionId, partnerConnection: { organizationId } },
      include: { partnerConnection: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  public async revoke(
    organizationId: string,
    id: string,
    revokedAt: Date,
    scope?: TransactionScope,
  ): Promise<PartnerSigningKeyRecord> {
    const existing = await this.exec(scope).partnerSigningKey.findFirst({
      where: { id, partnerConnection: { organizationId } },
    });
    if (existing === null) {
      throw new Error('Signing key was not found.');
    }
    const row = await this.exec(scope).partnerSigningKey.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt },
      include: { partnerConnection: true },
    });
    return toRecord(row);
  }

  public async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.partnerSigningKey.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}

export const createPrismaPartnerSigningKeyRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaPartnerSigningKeyRepository => new PrismaPartnerSigningKeyRepository(prisma, unitOfWork);
