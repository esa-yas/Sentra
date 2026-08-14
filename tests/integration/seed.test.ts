import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { prisma } from './setup';

/**
 * The development seed must be safe to run repeatedly (a new developer will run it more than
 * once). This drives the real seed script against the test database twice and asserts the
 * row counts are identical, proving every insert is guarded by a natural key or an
 * existence check rather than blindly appended.
 */
const runSeed = (): void => {
  const testUrl = process.env.TEST_DATABASE_URL as string;
  execFileSync('pnpm', ['--filter', '@sentra/db', 'exec', 'tsx', 'prisma/seed.ts'], {
    env: { ...process.env, DATABASE_URL: testUrl, DATABASE_DIRECT_URL: testUrl },
    stdio: 'ignore',
  });
};

describe('development seed', () => {
  it('is idempotent across repeated runs', async () => {
    runSeed();
    const first = {
      organizations: await prisma.organization.count(),
      consent: await prisma.consentRecord.count(),
      cases: await prisma.correlationCase.count(),
      recommendations: await prisma.recommendation.count(),
      operationalEvents: await prisma.operationalEvent.count(),
      retention: await prisma.retentionPolicy.count(),
    };

    runSeed();
    const second = {
      organizations: await prisma.organization.count(),
      consent: await prisma.consentRecord.count(),
      cases: await prisma.correlationCase.count(),
      recommendations: await prisma.recommendation.count(),
      operationalEvents: await prisma.operationalEvent.count(),
      retention: await prisma.retentionPolicy.count(),
    };

    expect(second).toEqual(first);
    // Sanity: the seed actually populated the synthetic journey.
    expect(first.cases).toBe(1);
    expect(first.recommendations).toBe(1);
    expect(first.operationalEvents).toBe(5);
  }, 60_000);
});
