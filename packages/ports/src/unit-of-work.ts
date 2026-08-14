/**
 * Transaction boundaries.
 *
 * Slide 034 requires a domain change and its outbox row to commit together. Rather than
 * hand the core a database handle, a use case receives a {@link UnitOfWork} and passes the
 * opaque {@link TransactionScope} to each repository call it wants inside the transaction.
 *
 * Version 1a semantics:
 *   * Nested {@link UnitOfWork.run} calls are rejected while an outer transaction is open.
 *   * A {@link TransactionScope} is valid only until its surrounding `run` settles; using it
 *     afterwards must fail.
 *   * `timeoutMs` rolls the transaction back when exceeded.
 *   * Minimum isolation is Read Committed. Adapters may strengthen to Serializable when
 *     requested, but Read Committed behaviour is always supported.
 *   * Staged audit and outbox writes roll back with the transaction.
 */

/**
 * An opaque handle to an open transaction. The adapter maps it to a concrete client; the
 * core only ever passes it along.
 */
export interface TransactionScope {
  readonly scopeId: string;
}

export interface TransactionOptions {
  /** Maximum time to wait for the transaction to complete before rolling back. */
  readonly timeoutMs?: number;
  /**
   * Serializable is required where a read-modify-write must not interleave. The audit
   * chain instead uses an advisory lock, which serialises only the tenant that needs it.
   */
  readonly isolation?: 'ReadCommitted' | 'Serializable';
}

export interface UnitOfWork {
  /**
   * Runs the callback inside one transaction. The transaction commits when the callback
   * resolves and rolls back when it rejects.
   */
  run<T>(callback: (scope: TransactionScope) => Promise<T>, options?: TransactionOptions): Promise<T>;

  /**
   * Serialises concurrent work for one logical key inside the current transaction, using a
   * lock that is released automatically on commit or rollback.
   *
   * The audit chain needs this: two requests for the same tenant must not both read the
   * same chain head and then write the same sequence number. Locking per tenant rather
   * than per table keeps one busy tenant from blocking every other.
   */
  lock(scope: TransactionScope, key: string): Promise<void>;
}
