import type {
  CreateUserInput,
  TransactionScope,
  UserRecord,
  UserRepository,
} from '@sentra/ports';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

type UserRow = Prisma.UserGetPayload<Record<string, never>>;

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  primaryEmail: row.primaryEmail,
  displayName: row.displayName,
  status: row.status,
  mfaEnabled: row.mfaEnabled,
  lastSeenAt: row.lastSeenAt,
  createdAt: row.createdAt,
});

export class PrismaUserRepository implements UserRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {}

  private exec(scope?: TransactionScope) {
    return scope === undefined ? this.prisma : this.unitOfWork.executor(scope);
  }

  public async create(input: CreateUserInput, scope?: TransactionScope): Promise<UserRecord> {
    const row = await this.exec(scope).user.create({
      data: {
        id: input.id,
        primaryEmail: input.primaryEmail,
        displayName: input.displayName,
        source: input.source,
      },
    });
    return toRecord(row);
  }

  public async findById(id: string, scope?: TransactionScope): Promise<UserRecord | null> {
    const row = await this.exec(scope).user.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  public async findByEmail(email: string, scope?: TransactionScope): Promise<UserRecord | null> {
    const row = await this.exec(scope).user.findUnique({ where: { primaryEmail: email } });
    return row === null ? null : toRecord(row);
  }

  public async touchLastSeen(id: string, at: Date, scope?: TransactionScope): Promise<void> {
    await this.exec(scope).user.update({ where: { id }, data: { lastSeenAt: at } });
  }
}

export const createPrismaUserRepository = (
  prisma: PrismaClient,
  unitOfWork: PrismaUnitOfWork,
): PrismaUserRepository => new PrismaUserRepository(prisma, unitOfWork);
