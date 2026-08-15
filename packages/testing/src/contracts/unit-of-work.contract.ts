import {
  NestedTransactionNotSupportedError,
  TransactionScopeClosedError,
  TransactionTimeoutError,
} from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import type { TransactionScope, UnitOfWork } from '@sentra/ports';

export interface UnitOfWorkContractHarness {
  readonly uow: UnitOfWork;
  readonly read: (key: string) => Promise<unknown>;
  readonly write: (scope: TransactionScope, key: string, value: unknown) => Promise<void>;
  readonly stageAudit?: (scope: TransactionScope) => Promise<void>;
  readonly listAudit?: () => readonly unknown[] | Promise<readonly unknown[]>;
  readonly stageOutbox?: (scope: TransactionScope, eventId: string) => Promise<void>;
  readonly listOutbox?: () => readonly string[] | Promise<readonly string[]>;
  readonly advanceTime?: (ms: number) => void;
}

export const describeUnitOfWorkContract = (
  name: string,
  factory: () => UnitOfWorkContractHarness,
): void => {
  describe(`${name} UnitOfWork`, () => {
    it('commits staged writes when the callback resolves', async () => {
      const { uow, read, write } = factory();

      await uow.run(async (scope) => {
        await write(scope, 'tenant', 'committed-value');
      });

      await expect(read('tenant')).resolves.toBe('committed-value');
    });

    it('rolls back staged writes when the callback rejects', async () => {
      const { uow, read, write } = factory();

      await expect(
        uow.run(async (scope) => {
          await write(scope, 'tenant', 'lost-value');
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      await expect(read('tenant')).resolves.toBeUndefined();
    });

    it('rolls back staged audit and outbox writes together', async () => {
      const { uow, stageAudit, listAudit, stageOutbox, listOutbox } = factory();
      if (stageAudit === undefined || listAudit === undefined || stageOutbox === undefined || listOutbox === undefined) {
        return;
      }

      await expect(
        uow.run(async (scope) => {
          await stageAudit(scope);
          await stageOutbox(scope, '01OUTBOX_ROLLBACK');
          throw new Error('rollback composite');
        }),
      ).rejects.toThrow('rollback composite');

      expect(await Promise.resolve(listAudit())).toHaveLength(0);
      expect(await Promise.resolve(listOutbox())).toHaveLength(0);
    });

    it('rejects nested run calls while a transaction is open', async () => {
      const { uow } = factory();

      await uow.run(async () => {
        await expect(uow.run(async () => undefined)).rejects.toBeInstanceOf(
          NestedTransactionNotSupportedError,
        );
      });
    });

    it('rejects use of a scope after its transaction completes', async () => {
      const { uow } = factory();
      let closedScope: TransactionScope | undefined;

      await uow.run(async (scope) => {
        closedScope = scope;
      });

      await expect(uow.lock(closedScope as TransactionScope, 'audit:closed')).rejects.toBeInstanceOf(
        TransactionScopeClosedError,
      );
    });

    it('rolls back when the configured timeout is exceeded', async () => {
      const { uow, read, write, advanceTime } = factory();
      if (advanceTime === undefined) {
        return;
      }

      await expect(
        uow.run(async (scope) => {
          await write(scope, 'tenant', 'timed-out');
          advanceTime(11);
          return 'late';
        }, { timeoutMs: 10 }),
      ).rejects.toBeInstanceOf(TransactionTimeoutError);

      await expect(read('tenant')).resolves.toBeUndefined();
    });

    it('treats a second lock of the same key in one transaction as reentrant', async () => {
      const { uow } = factory();

      await uow.run(async (scope) => {
        await uow.lock(scope, 'audit:org_1');
        await expect(uow.lock(scope, 'audit:org_1')).resolves.toBeUndefined();
      });
    });

    it('releases a lock after the transaction completes', async () => {
      const { uow } = factory();

      await uow.run(async (scope) => {
        await uow.lock(scope, 'audit:org_2');
      });

      await expect(
        uow.run(async (scope) => {
          await uow.lock(scope, 'audit:org_2');
        }),
      ).resolves.toBeUndefined();
    });
  });
};
