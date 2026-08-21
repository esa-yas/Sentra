import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepository,
  TransactionScope,
} from '@sentra/ports';
import type { InvitationStatus } from '@sentra/contracts';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type InvitationRow = Prisma.OrganizationInvitationGetPayload<Record<string, never>>;

const toRecord = (row: InvitationRow): InvitationRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  email: row.email,
  role: row.role,
  status: row.status,
  tokenLookup: row.tokenLookup,
  invitedBy: row.invitedBy,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  acceptedAt: row.acceptedAt,
  revokedAt: row.revokedAt,
});

export class PrismaInvitationRepository implements InvitationRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(
    input: CreateInvitationInput,
    scope?: TransactionScope,
  ): Promise<InvitationRecord> {
    const row = await this.exec(scope).organizationInvitation.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        tokenLookup: input.tokenLookup,
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
        correlationId: input.correlationId,
      },
    });
    return toRecord(row);
  }

  public async findByTokenLookup(
    tokenLookup: string,
    scope?: TransactionScope,
  ): Promise<InvitationRecord | null> {
    const row = await this.exec(scope).organizationInvitation.findUnique({ where: { tokenLookup } });
    return row === null ? null : toRecord(row);
  }

  public async listForOrganization(
    organizationId: string,
    scope?: TransactionScope,
  ): Promise<readonly InvitationRecord[]> {
    const rows = await this.exec(scope).organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  public async updateStatus(
    id: string,
    status: InvitationStatus,
    at: Date,
    scope?: TransactionScope,
  ): Promise<InvitationRecord> {
    const row = await this.exec(scope).organizationInvitation.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACCEPTED' ? { acceptedAt: at } : {}),
        ...(status === 'REVOKED' ? { revokedAt: at } : {}),
      },
    });
    return toRecord(row);
  }
}

export const createPrismaInvitationRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaInvitationRepository => new PrismaInvitationRepository(prisma, unitOfWork);
