import type { TransactionScope } from '@sentra/ports';
import type { FakeUnitOfWork } from './unit-of-work';

/**
 * Test helper that stages outbox identifiers through the same coordinator as audit writes.
 */
export class FakeOutboxStaging {
  private readonly committed: string[] = [];

  public constructor(private readonly unitOfWork: FakeUnitOfWork) {}

  public readonly events = (): readonly string[] => [...this.committed];

  public stage(scope: TransactionScope, eventId: string): void {
    this.unitOfWork.assertScopeActive(scope);
    this.unitOfWork.coordinator.stage(scope.scopeId, {
      commit: () => {
        this.committed.push(eventId);
      },
    });
  }
}

export const createFakeOutboxStaging = (unitOfWork: FakeUnitOfWork): FakeOutboxStaging =>
  new FakeOutboxStaging(unitOfWork);
