/**
 * @sentra/adapters holds the concrete implementations of the ports. This is the only place
 * provider SDKs may be imported (enforced by dependency-cruiser).
 *
 * The composition root selects a mode; the core is unaware which implementation it received.
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
export { PrismaUnitOfWork, createPrismaUnitOfWork } from './prisma/prisma-unit-of-work';
export { PrismaAuditProvider, createPrismaAuditProvider } from './prisma/prisma-audit-provider';
export { PrismaOutboxRepository, createPrismaOutboxRepository } from './prisma/prisma-outbox-repository';
export {
  PrismaDecisionPersistence,
  createPrismaDecisionPersistence,
} from './prisma/prisma-decision-persistence';
export { PostgresOperationsStore, createPostgresOperationsStore } from './prisma/postgres-operations-store';
