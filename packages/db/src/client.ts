import { PrismaClient, Prisma } from '@prisma/client';
import type { AppConfig } from '@sentra/config';

// Re-exported as values: adapters need `Prisma.JsonNull` and the error classes, not just
// the types beneath them.
export { PrismaClient, Prisma };

/**
 * The Prisma transaction client. Every repository accepts either the root client or this,
 * which is what lets a use case commit a business change and its audit and outbox rows in
 * one transaction (slide 034).
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Either a pooled client or an open transaction. Repositories are agnostic. */
export type PrismaExecutor = PrismaClient | PrismaTransactionClient;

export interface CreatePrismaClientOptions {
  readonly config: AppConfig;
  /** Overrides the connection string, used by the integration suite. */
  readonly databaseUrl?: string;
  readonly onQuery?: (event: { query: string; durationMs: number }) => void;
}

/**
 * Builds the single Prisma client for a process.
 *
 * A statement timeout is applied at the connection level so a pathological query cannot
 * hold a request past its deadline: the synchronous decision path must fail neutral rather
 * than hang (slide 035).
 */
export const createPrismaClient = (options: CreatePrismaClientOptions): PrismaClient => {
  const url = withConnectionParameters(
    options.databaseUrl ?? options.config.database.url,
    options.config,
  );

  const client = new PrismaClient({
    datasources: { db: { url } },
    log: options.onQuery === undefined ? [] : [{ emit: 'event', level: 'query' }],
    errorFormat: options.config.runtime.isProduction ? 'minimal' : 'pretty',
  });

  if (options.onQuery !== undefined) {
    // `$on('query')` is only registered when a consumer asks for it, so production does
    // not pay to serialise every statement.
    client.$on('query', (event) => {
      options.onQuery?.({ query: event.query, durationMs: event.duration });
    });
  }

  return client;
};

/**
 * Appends pool and timeout parameters. Supabase serves the pooled connection through
 * PgBouncer in transaction mode, which requires prepared statements to be disabled.
 */
const withConnectionParameters = (databaseUrl: string, config: AppConfig): string => {
  const url = new URL(databaseUrl);

  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(config.database.poolSize));
  }
  if (!url.searchParams.has('statement_timeout')) {
    url.searchParams.set('statement_timeout', String(config.database.statementTimeoutMs));
  }
  // A transaction pooler cannot hold a session-level prepared statement.
  if (url.port === '6543' && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }

  return url.toString();
};

/** Prisma error codes the adapters translate into domain errors. */
export const PRISMA_ERROR_CODES = {
  UNIQUE_CONSTRAINT_VIOLATION: 'P2002',
  FOREIGN_KEY_CONSTRAINT_VIOLATION: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
  TRANSACTION_TIMEOUT: 'P2028',
} as const;

export const isPrismaKnownError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError;

export const isUniqueConstraintViolation = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  isPrismaKnownError(error) && error.code === PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION;

export const isRecordNotFound = (error: unknown): error is Prisma.PrismaClientKnownRequestError =>
  isPrismaKnownError(error) && error.code === PRISMA_ERROR_CODES.RECORD_NOT_FOUND;

/** Column names implicated in a unique-constraint violation, when Prisma reports them. */
export const uniqueConstraintTargets = (error: unknown): readonly string[] => {
  if (!isUniqueConstraintViolation(error)) {
    return [];
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof target === 'string' ? [target] : [];
};
