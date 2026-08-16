import type {
  CreateIdentityLinkInput,
  IdentityLinkRecord,
  IdentityLinkRepository,
  TransactionScope,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type IdentityLinkRow = Prisma.IdentityLinkGetPayload<Record<string, never>>;

const toRecord = (row: IdentityLinkRow): IdentityLinkRecord => ({
  id: row.id,
  userId: row.userId,
  issuer: row.issuer,
  subject: row.subject,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

export class PrismaIdentityLinkRepository implements IdentityLinkRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(
    input: CreateIdentityLinkInput,
    scope?: TransactionScope,
  ): Promise<IdentityLinkRecord> {
    const row = await this.exec(scope).identityLink.create({
      data: {
        id: input.id,
        userId: input.userId,
        issuer: input.issuer,
        subject: input.subject,
      },
    });
    return toRecord(row);
  }

  public async findByIssuerAndSubject(
    issuer: string,
    subject: string,
    scope?: TransactionScope,
  ): Promise<IdentityLinkRecord | null> {
    const row = await this.exec(scope).identityLink.findUnique({
      where: { issuer_subject: { issuer, subject } },
    });
    return row === null ? null : toRecord(row);
  }

  public async touchLastUsed(id: string, at: Date, scope?: TransactionScope): Promise<void> {
    await this.exec(scope).identityLink.update({ where: { id }, data: { lastUsedAt: at } });
  }
}

export const createPrismaIdentityLinkRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaIdentityLinkRepository => new PrismaIdentityLinkRepository(prisma, unitOfWork);
