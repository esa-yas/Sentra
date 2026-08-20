import type {
  CreateOrganizationInput,
  OrganizationRecord,
  OrganizationRepository,
  TransactionScope,
  UpdateOrganizationInput,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type OrganizationRow = Prisma.OrganizationGetPayload<Record<string, never>>;

const toRecord = (row: OrganizationRow): OrganizationRecord => ({
  id: row.id,
  slug: row.slug,
  legalName: row.legalName,
  type: row.type,
  status: row.status,
  jurisdiction: row.jurisdiction,
  dataResidency: row.dataResidency,
  defaultCurrency: row.defaultCurrency,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: row.createdBy,
  source: row.source,
});

export class PrismaOrganizationRepository implements OrganizationRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(
    input: CreateOrganizationInput,
    scope?: TransactionScope,
  ): Promise<OrganizationRecord> {
    // approvalStatus is intentionally not set here: the schema default (SANDBOX) applies, so
    // every newly created tenant starts in the sandbox lifecycle until reviewed.
    const row = await this.exec(scope).organization.create({
      data: {
        id: input.id,
        slug: input.slug,
        legalName: input.legalName,
        type: input.type,
        jurisdiction: input.jurisdiction,
        dataResidency: input.dataResidency,
        defaultCurrency: input.defaultCurrency,
        createdBy: input.createdBy,
        source: input.source,
        correlationId: input.correlationId,
      },
    });
    return toRecord(row);
  }

  public async findById(id: string, scope?: TransactionScope): Promise<OrganizationRecord | null> {
    const row = await this.exec(scope).organization.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  public async findBySlug(slug: string, scope?: TransactionScope): Promise<OrganizationRecord | null> {
    const row = await this.exec(scope).organization.findUnique({ where: { slug } });
    return row === null ? null : toRecord(row);
  }

  public async update(
    id: string,
    input: UpdateOrganizationInput,
    scope?: TransactionScope,
  ): Promise<OrganizationRecord> {
    const row = await this.exec(scope).organization.update({
      where: { id },
      data: {
        ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.defaultCurrency === undefined ? {} : { defaultCurrency: input.defaultCurrency }),
      },
    });
    return toRecord(row);
  }

  public async listByIds(
    ids: readonly string[],
    scope?: TransactionScope,
  ): Promise<readonly OrganizationRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.exec(scope).organization.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toRecord);
  }
}

export const createPrismaOrganizationRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaOrganizationRepository => new PrismaOrganizationRepository(prisma, unitOfWork);
