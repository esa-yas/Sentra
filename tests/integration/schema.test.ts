import { describe, expect, it } from 'vitest';
import { createOrganization, correlationId, id, prisma, subjectRef } from './setup';

/**
 * Proves the committed migrations produced the schema the application expects: the domain
 * tables, their indexes, row-level security, and the database-level check constraints that
 * back up the contract invariants. These depend on real PostgreSQL semantics and cannot be
 * covered by an in-memory fake.
 */
describe('schema and migrations', () => {
  it('creates every domain table on an empty database', async () => {
    const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`,
    );
    const names = new Set(rows.map((row) => row.tablename));
    for (const expected of [
      'consent_records',
      'telecom_risk_events',
      'payment_intents',
      'correlation_cases',
      'risk_assessments',
      'recommendations',
      'bank_outcomes',
      'notification_records',
      'operational_events',
      'audit_events',
      'outbox_events',
      'inbox_events',
      'idempotency_keys',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('enables row-level security on every application table', async () => {
    const rows = await prisma.$queryRawUnsafe<{ tablename: string; rowsecurity: boolean }[]>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`,
    );
    const withoutRls = rows
      .filter((row) => row.tablename !== '_prisma_migrations' && row.rowsecurity !== true)
      .map((row) => row.tablename);
    expect(withoutRls).toEqual([]);
  });

  it('creates the indexes that back the important list queries', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public';`,
    );
    const names = new Set(rows.map((row) => row.indexname));
    for (const expected of [
      'operational_events_occurredAt_idx',
      'recommendations_organizationId_issuedAt_idx',
      'correlation_cases_organizationId_status_openedAt_idx',
      'telecom_risk_events_organizationId_observedAt_idx',
      'payment_intents_organizationId_initiatedAt_idx',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('rejects a negative payment amount via a check constraint', async () => {
    const organizationId = await createOrganization('BANK');
    await expect(
      prisma.paymentIntent.create({
        data: {
          id: id('pi'),
          organizationId,
          subjectRef: subjectRef(),
          amountMinor: BigInt(-1),
          currency: 'GBP',
          initiatedAt: new Date(),
          correlationId: correlationId(),
          source: 'test',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a zero notification attempt via a check constraint', async () => {
    const organizationId = await createOrganization('BANK');
    await expect(
      prisma.notificationRecord.create({
        data: {
          id: id('ntf'),
          organizationId,
          subjectRef: subjectRef(),
          channel: 'PUSH',
          notificationType: 'scam_warning',
          dedupeKey: id('dedupe'),
          attempt: 0,
          correlationId: correlationId(),
          source: 'test',
        },
      }),
    ).rejects.toThrow();
  });

  it('maintains updated_at with a database trigger on raw updates', async () => {
    const organizationId = await createOrganization('BANK');
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    // A raw UPDATE bypasses Prisma's @updatedAt; the trigger must still advance the column.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.$executeRawUnsafe(
      `UPDATE organizations SET "legalName" = 'Renamed (Synthetic)' WHERE id = $1;`,
      organizationId,
    );
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});
