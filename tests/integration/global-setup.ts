import { execFileSync } from 'node:child_process';
import { loadDotEnvFile } from '@sentra/config';
import { PrismaClient } from '@sentra/db';

/**
 * Runs once before the database integration suite.
 *
 * Gives every run an empty schema and then applies the committed migration history with
 * `prisma migrate deploy` (never `db push`, never the destructive `migrate reset` CLI). The
 * empty schema is what makes this suite a genuine proof that the migrations apply cleanly to
 * a fresh database.
 *
 * Two guards keep this safe: it targets TEST_DATABASE_URL only, and it refuses to run unless
 * that URL is a local `*_test` database. It never touches the development or a remote
 * database, so running the suite cannot destroy working data.
 */
export default async function globalSetup(): Promise<void> {
  loadDotEnvFile();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl === undefined || testUrl === '') {
    throw new Error(
      'TEST_DATABASE_URL must be set (see .env) to run the database integration suite.',
    );
  }
  if (!/sentra_test/.test(testUrl) || !/(localhost|127\.0\.0\.1)/.test(testUrl)) {
    throw new Error(
      `Refusing to run integration tests: TEST_DATABASE_URL must be a local *_test database (got ${testUrl}).`,
    );
  }

  // Start from an empty schema. This is a local test database (asserted above), so a clean
  // slate is safe and is exactly what "migrations apply to an empty database" requires.
  const client = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.$executeRawUnsafe('CREATE SCHEMA public;');
  } finally {
    await client.$disconnect();
  }

  // Apply the committed migration history. `migrate deploy` is non-destructive and is the
  // same command used for staging and production.
  execFileSync(
    'pnpm',
    ['--filter', '@sentra/db', 'exec', 'prisma', 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: testUrl, DATABASE_DIRECT_URL: testUrl },
      stdio: 'inherit',
    },
  );
}
