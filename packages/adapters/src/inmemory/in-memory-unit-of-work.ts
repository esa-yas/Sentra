import {
  NestedTransactionNotSupportedError,
  TransactionScopeClosedError,
  TransactionTimeoutError,
} from '@sentra/contracts';
import type { Clock, TransactionOptions, TransactionScope, UnitOfWork } from '@sentra/ports';

/**
 * An in-process {@link UnitOfWork} for the Version 1a "in-memory" provider mode.
 *
 * It honours the same contract the Postgres adapter must (Slice 2): nested transactions are
 * rejected, a scope is invalid once its `run` settles, a timeout rolls back, and staged
 * writes commit or roll back together. Because it is single-process there is no real
 * database isolation to enforce; `lock` is a cooperative no-op that still validates scope.
 */
export interface StagedWrite {
  readonly commit: () => void;
  readonly rollback?: () => void;
}

export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly staged = new Map<string, StagedWrite[]>();
  private activeScopeId: string | null = null;
  private counter = 0;

  public constructor(private readonly clock: Clock) {}

  public stage(scope: TransactionScope, write: StagedWrite): void {
    this.assertScopeActive(scope);
    const bucket = this.staged.get(scope.scopeId) ?? [];
    bucket.push(write);
    this.staged.set(scope.scopeId, bucket);
  }

  public assertScopeActive(scope: TransactionScope): void {
    if (this.activeScopeId !== scope.scopeId) {
      throw new TransactionScopeClosedError(scope.scopeId);
    }
  }

  public async run<T>(
    callback: (scope: TransactionScope) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    if (this.activeScopeId !== null) {
      throw new NestedTransactionNotSupportedError();
    }

    const scope: TransactionScope = { scopeId: `tx_${++this.counter}` };
    const startedAt = this.clock.monotonicMs();
    this.activeScopeId = scope.scopeId;
    this.staged.set(scope.scopeId, []);

    try {
      const result = await callback(scope);

      if (options?.timeoutMs !== undefined && this.clock.monotonicMs() - startedAt > options.timeoutMs) {
        throw new TransactionTimeoutError(options.timeoutMs);
      }

      for (const write of this.staged.get(scope.scopeId) ?? []) {
        write.commit();
      }
      return result;
    } catch (error) {
      const bucket = this.staged.get(scope.scopeId) ?? [];
      for (let index = bucket.length - 1; index >= 0; index -= 1) {
        bucket[index]?.rollback?.();
      }
      throw error;
    } finally {
      this.activeScopeId = null;
      this.staged.delete(scope.scopeId);
    }
  }

  public async lock(scope: TransactionScope, _key: string): Promise<void> {
    this.assertScopeActive(scope);
  }
}

export const createInMemoryUnitOfWork = (clock: Clock): InMemoryUnitOfWork =>
  new InMemoryUnitOfWork(clock);
