/**
 * @sentra/adapters holds the concrete implementations of the ports. This is the only place
 * provider SDKs may be imported (enforced by dependency-cruiser).
 *
 * Version 1a ships an in-memory provider mode so the product is visible and testable before
 * the Postgres, Redis, and BullMQ adapters land. The composition root selects a mode; the
 * core is unaware which implementation it received.
 */
export { SystemClock, createSystemClock } from './inmemory/system-clock';
export { UlidIdGenerator, createUlidIdGenerator } from './inmemory/ulid-id-generator';
export {
  InMemoryUnitOfWork,
  createInMemoryUnitOfWork,
  type StagedWrite,
} from './inmemory/in-memory-unit-of-work';
export {
  InMemoryAuditProvider,
  createInMemoryAuditProvider,
} from './inmemory/in-memory-audit-provider';
export {
  InMemoryOperationsStore,
  createInMemoryOperationsStore,
} from './inmemory/operations-store';
