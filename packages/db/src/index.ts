/**
 * @sentra/db owns the Prisma schema, its migrations, and the client factory.
 *
 * Only @sentra/adapters may import this package. The application core reaches persistence
 * through repository interfaces so that moving from Supabase PostgreSQL to Cloud SQL is an
 * adapter change rather than a rewrite (slide 052).
 */
export {
  PrismaClient,
  Prisma,
  createPrismaClient,
  isPrismaKnownError,
  isUniqueConstraintViolation,
  isRecordNotFound,
  uniqueConstraintTargets,
  PRISMA_ERROR_CODES,
  type PrismaExecutor,
  type PrismaTransactionClient,
  type CreatePrismaClientOptions,
} from './client';
