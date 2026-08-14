/**
 * @sentra/contracts is the shared vocabulary of the platform: identifiers, enumerations,
 * request and response schemas, the error envelope, and the payload deny-list.
 *
 * It deliberately has no dependency on any other workspace package, so the core, the
 * adapters, the Express edge, and the test suite can all agree on one definition of a
 * purpose, a role, or an audit action without depending on each other.
 */
export * from './errors';
export * from './purpose';
export * from './organization';
export * from './authorization';
export * from './audit';
export * from './audit-canonical';
export * from './principal';
export * from './identifiers';
export * from './events';
export * from './http';
export * from './deny-list';
export * from './api';
