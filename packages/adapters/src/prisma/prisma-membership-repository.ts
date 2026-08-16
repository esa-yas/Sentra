import type {
  CreateMembershipInput,
  MembershipRecord,
  MembershipRepository,
  MembershipWithOrganization,
  PagedResult,
  Pagination,
  TransactionScope,
} from '@sentra/ports';
import type { MemberRole, MemberStatus } from '@sentra/contracts';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type MembershipRow = Prisma.OrganizationMemberGetPayload<Record<string, never>>;
type MembershipWithOrgRow = Prisma.OrganizationMemberGetPayload<{ include: { organization: true } }>;

const toRecord = (row: MembershipRow): MembershipRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  userId: row.userId,
  role: row.role,
  status: row.status,
  invitedBy: row.invitedBy,
  createdAt: row.createdAt,
  activatedAt: row.activatedAt,
  removedAt: row.removedAt,
});

const toRecordWithOrganization = (row: MembershipWithOrgRow): MembershipWithOrganization => ({
  ...toRecord(row),
  organizationSlug: row.organization.slug,
  organizationType: row.organization.type,
  organizationStatus: row.organization.status,
});

export class PrismaMembershipRepository implements MembershipRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(
    input: CreateMembershipInput,
    scope?: TransactionScope,
  ): Promise<MembershipRecord> {
    const row = await this.exec(scope).organizationMember.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        invitedBy: input.invitedBy,
        activatedAt: input.activatedAt,
        correlationId: input.correlationId,
      },
    });
    return toRecord(row);
  }

  public async findById(id: string, scope?: TransactionScope): Promise<MembershipRecord | null> {
    const row = await this.exec(scope).organizationMember.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  public async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
    scope?: TransactionScope,
  ): Promise<MembershipRecord | null> {
    const row = await this.exec(scope).organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return row === null ? null : toRecord(row);
  }

  public async listActiveForUser(
    userId: string,
    scope?: TransactionScope,
  ): Promise<readonly MembershipWithOrganization[]> {
    const rows = await this.exec(scope).organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecordWithOrganization);
  }

  public async listForOrganization(
    organizationId: string,
    pagination: Pagination,
    scope?: TransactionScope,
  ): Promise<PagedResult<MembershipRecord>> {
    const rows = await this.exec(scope).organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      take: pagination.limit + 1,
      ...(pagination.cursor === undefined
        ? {}
        : { cursor: { id: pagination.cursor }, skip: 1 }),
    });

    const items = rows.slice(0, pagination.limit).map(toRecord);
    if (rows.length > pagination.limit) {
      return { items, nextCursor: rows[pagination.limit - 1]!.id };
    }
    return { items };
  }

  public async updateRole(
    id: string,
    role: MemberRole,
    scope?: TransactionScope,
  ): Promise<MembershipRecord> {
    const row = await this.exec(scope).organizationMember.update({ where: { id }, data: { role } });
    return toRecord(row);
  }

  public async updateStatus(
    id: string,
    status: MemberStatus,
    at: Date,
    scope?: TransactionScope,
  ): Promise<MembershipRecord> {
    const row = await this.exec(scope).organizationMember.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACTIVE' ? { activatedAt: at } : {}),
        ...(status === 'REMOVED' ? { removedAt: at } : {}),
      },
    });
    return toRecord(row);
  }

  public async countActiveByRole(
    organizationId: string,
    role: MemberRole,
    scope?: TransactionScope,
  ): Promise<number> {
    return this.exec(scope).organizationMember.count({
      where: { organizationId, role, status: 'ACTIVE' },
    });
  }
}

export const createPrismaMembershipRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaMembershipRepository => new PrismaMembershipRepository(prisma, unitOfWork);
