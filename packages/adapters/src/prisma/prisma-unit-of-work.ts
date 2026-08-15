import {
  NestedTransactionNotSupportedError,
  TransactionScopeClosedError,
  TransactionTimeoutError,
} from '@sentra/contracts';
import { Prisma, type PrismaClient, type PrismaTransactionClient } from '@sentra/db';
import type { TransactionOptions, TransactionScope, UnitOfWork } from '@sentra/ports';
import { AsyncLocalStorage } from 'node:async_hooks';

interface ActiveTransaction {
  readonly tx: PrismaTransactionClient;
  readonly locks: Set<string>;
}

/**
 * PostgreSQL unit of work. Each {@link run} opens one interactive Prisma transaction
 * (Read Committed by default). Concurrent requests each get their own transaction;
 * nested {@link run} calls on the same async stack are rejected.
 *
 * Transactional writes must go through {@link executor} so they cannot accidentally use
 * the pooled client.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  private readonly active = new Map<string, ActiveTransaction>();
  private readonly nesting = new AsyncLocalStorage<string>();
  private counter = 0;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly timeoutMs: number,
  ) {}

  public get client(): PrismaClient {
    return this.prisma;
  }

  public executor(scope: TransactionScope): PrismaTransactionClient {
    const active = this.active.get(scope.scopeId);
    if (active === undefined) {
      throw new TransactionScopeClosedError(scope.scopeId);
    }
    return active.tx;
  }

  public async run<T>(
    callback: (scope: TransactionScope) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    if (this.nesting.getStore() !== undefined) {
      throw new NestedTransactionNotSupportedError();
    }

    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const isolation =
      options?.isolation === 'Serializable'
        ? Prisma.TransactionIsolationLevel.Serializable
        : Prisma.TransactionIsolationLevel.ReadCommitted;

    const scope: TransactionScope = { scopeId: `pgtx_${++this.counter}` };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          this.active.set(scope.scopeId, { tx, locks: new Set() });
          try {
            return await this.nesting.run(scope.scopeId, () => callback(scope));
          } finally {
            this.active.delete(scope.scopeId);
          }
        },
        { maxWait: 20_000, timeout, isolationLevel: isolation },
      );
    } catch (error) {
      if (isPrismaTimeout(error)) {
        throw new TransactionTimeoutError(timeout);
      }
      throw error;
    }
  }

  public async lock(scope: TransactionScope, key: string): Promise<void> {
    const active = this.active.get(scope.scopeId);
    if (active === undefined) {
      throw new TransactionScopeClosedError(scope.scopeId);
    }
    if (active.locks.has(key)) {
      return;
    }
    await active.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    active.locks.add(key);
  }
}

const isPrismaTimeout = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
    return true;
  }
  return error instanceof Error && /transaction.*timeout/i.test(error.message);
};

export const createPrismaUnitOfWork = (prisma: PrismaClient, timeoutMs: number): PrismaUnitOfWork =>
  new PrismaUnitOfWork(prisma, timeoutMs);
