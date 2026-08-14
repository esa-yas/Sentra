import {
  NestedTransactionNotSupportedError,
  TransactionScopeClosedError,
  TransactionTimeoutError,
} from '@sentra/contracts';
import type { TransactionScope, UnitOfWork } from '@sentra/ports';
import { TransactionCoordinator } from './transaction-coordinator';
import type { FakeClock } from './clock';
import { createFakeClock } from './clock';

interface ScopeState {
  readonly locks: Set<string>;
}

interface ManagedScope extends TransactionScope {
  readonly startedAtMs: number;
  active: boolean;
}

/**
 * In-memory unit of work with explicit commit, rollback, timeout, and scope-lifetime rules.
 */
export class FakeUnitOfWork implements UnitOfWork {
  public readonly coordinator = new TransactionCoordinator();

  private readonly committed = new Map<string, unknown>();
  private readonly scopes = new Map<string, ScopeState>();
  private scopeCounter = 0;
  private activeScopeId: string | null = null;

  public constructor(private readonly clock: FakeClock = createFakeClock()) {}

  public read(key: string): unknown {
    return this.committed.get(key);
  }

  public stage(scope: TransactionScope, key: string, value: unknown): void {
    this.assertScopeActive(scope);
    this.coordinator.stage(scope.scopeId, {
      commit: () => {
        this.committed.set(key, value);
      },
    });
  }

  public assertScopeActive(scope: TransactionScope): void {
    const managed = scope as ManagedScope;
    if (!this.scopes.has(scope.scopeId) || !managed.active || this.activeScopeId !== scope.scopeId) {
      throw new TransactionScopeClosedError(scope.scopeId);
    }
  }

  public async run<T>(
    callback: (scope: TransactionScope) => Promise<T>,
    options?: Parameters<UnitOfWork['run']>[1],
  ): Promise<T> {
    if (this.activeScopeId !== null) {
      throw new NestedTransactionNotSupportedError();
    }

    const scope: ManagedScope = {
      scopeId: `tx_${++this.scopeCounter}`,
      startedAtMs: this.clock.monotonicMs(),
      active: true,
    };
    this.activeScopeId = scope.scopeId;
    this.scopes.set(scope.scopeId, { locks: new Set() });

    const timeoutMs = options?.timeoutMs;
    const runBody = async (): Promise<T> => callback(scope);

    try {
      const result =
        timeoutMs === undefined
          ? await runBody()
          : await this.withTimeout(runBody, timeoutMs, scope.startedAtMs);

      this.coordinator.commit(scope.scopeId);
      return result;
    } catch (error) {
      this.coordinator.rollback(scope.scopeId);
      throw error;
    } finally {
      scope.active = false;
      this.activeScopeId = null;
      this.scopes.delete(scope.scopeId);
    }
  }

  public async lock(scope: TransactionScope, key: string): Promise<void> {
    this.assertScopeActive(scope);
    const state = this.scopes.get(scope.scopeId);
    if (state === undefined) {
      throw new TransactionScopeClosedError(scope.scopeId);
    }
    if (state.locks.has(key)) {
      throw new Error(`Lock ${key} is already held in scope ${scope.scopeId}.`);
    }
    state.locks.add(key);
    this.coordinator.stage(scope.scopeId, {
      commit: () => undefined,
      rollback: () => {
        state.locks.delete(key);
      },
    });
  }

  private async withTimeout<T>(
    callback: () => Promise<T>,
    timeoutMs: number,
    startedAtMs: number,
  ): Promise<T> {
    const result = await callback();
    if (this.clock.monotonicMs() - startedAtMs > timeoutMs) {
      throw new TransactionTimeoutError(timeoutMs);
    }
    return result;
  }
}

export const createFakeUnitOfWork = (clock?: FakeClock): FakeUnitOfWork =>
  new FakeUnitOfWork(clock);
