/**
 * Stages work to commit or roll back with a {@link UnitOfWork} transaction.
 *
 * Fakes that must share a transaction's fate — notably the audit provider — register
 * commit and rollback handlers here rather than writing through the unit of work
 * interface itself.
 */
export interface TransactionRegistration {
  readonly commit: () => void;
  readonly rollback?: () => void;
}

export class TransactionCoordinator {
  private readonly staged = new Map<string, TransactionRegistration[]>();

  public stage(scopeId: string, registration: TransactionRegistration): void {
    const bucket = this.staged.get(scopeId);
    if (bucket === undefined) {
      this.staged.set(scopeId, [registration]);
      return;
    }
    bucket.push(registration);
  }

  public commit(scopeId: string): void {
    const registrations = this.staged.get(scopeId) ?? [];
    for (const registration of registrations) {
      registration.commit();
    }
    this.staged.delete(scopeId);
  }

  public rollback(scopeId: string): void {
    const registrations = this.staged.get(scopeId) ?? [];
    for (const registration of [...registrations].reverse()) {
      registration.rollback?.();
    }
    this.staged.delete(scopeId);
  }

  public hasPending(scopeId: string): boolean {
    return this.staged.has(scopeId);
  }
}
