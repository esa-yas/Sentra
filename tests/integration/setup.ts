import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach } from 'vitest';
import { loadEnv } from '@sentra/config';
import { createPrismaClient, type PrismaClient } from '@sentra/db';

/**
 * Per-file harness for the database integration suite. Builds one Prisma client pointed at
 * TEST_DATABASE_URL through the real client factory (so the suite exercises the same pooling
 * and timeout behaviour the application uses), and truncates every table before each test so
 * cases are independent. `fileParallelism` is disabled in vitest.config.ts, so truncation
 * cannot race across files.
 */
const config = loadEnv();
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl === undefined || testUrl === '') {
  throw new Error('TEST_DATABASE_URL must be set to run the database integration suite.');
}

export const prisma: PrismaClient = createPrismaClient({ config, databaseUrl: testUrl });

/** Every application table, in no particular order — TRUNCATE ... CASCADE handles FKs. */
const ALL_TABLES = [
  'organizations',
  'users',
  'identity_links',
  'organization_members',
  'partner_connections',
  'partner_signing_keys',
  'audit_events',
  'outbox_events',
  'inbox_events',
  'idempotency_keys',
  'retention_policies',
  'retention_runs',
  'consent_records',
  'telecom_risk_events',
  'payment_intents',
  'correlation_cases',
  'risk_assessments',
  'recommendations',
  'bank_outcomes',
  'notification_records',
  'operational_events',
  'partner_api_requests',
] as const;

export const resetDatabase = async (): Promise<void> => {
  const list = ALL_TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
};

/** A synthetic, obviously-fake id. Column type is TEXT, so any unique string is valid. */
export const id = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '')}`;

/** A valid correlation id (>= 8 chars, safe charset). */
export const correlationId = (): string => `test-${randomUUID().slice(0, 18)}`;

/** A valid opaque pairwise subject reference (>= 24 chars, safe charset). */
export const subjectRef = (): string => `subj_test_${randomUUID().replace(/-/g, '')}`;

let orgCounter = 0;

/** Creates a synthetic tenant and returns its id. */
export const createOrganization = async (
  type: 'BANK' | 'TELECOM' | 'PLATFORM' = 'BANK',
): Promise<string> => {
  orgCounter += 1;
  const organizationId = id('org');
  await prisma.organization.create({
    data: {
      id: organizationId,
      slug: `test-org-${orgCounter}-${randomUUID().slice(0, 8)}`,
      legalName: `Test Organization ${orgCounter} (Synthetic)`,
      type,
      jurisdiction: 'GB',
      dataResidency: 'GB',
      defaultCurrency: 'GBP',
      source: 'test',
    },
  });
  return organizationId;
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
