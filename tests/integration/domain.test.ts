import { describe, expect, it } from 'vitest';
import { createOrganization, correlationId, id, prisma, subjectRef } from './setup';

/**
 * Referential integrity, tenant-aware uniqueness, cross-tenant isolation, transaction
 * rollback, and index-backed pagination — all against real PostgreSQL.
 */
describe('domain persistence', () => {
  it('enforces foreign keys: a recommendation cannot reference a missing case', async () => {
    const organizationId = await createOrganization('BANK');
    await expect(
      prisma.recommendation.create({
        data: {
          id: id('rec'),
          organizationId,
          caseId: id('missing-case'),
          riskAssessmentId: id('missing-assessment'),
          subjectRef: subjectRef(),
          recommendedAction: 'WARN',
          riskScore: 50,
          riskLevel: 'MEDIUM',
          uncertainty: '0.100',
          reasonCodes: ['NEW_PAYEE'],
          summary: 'synthetic',
          authorityNote: 'Advisory only.',
          policyVersion: 'policy-test',
          rulesVersion: 'rules-test',
          correlationId: correlationId(),
          source: 'test',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces the consent uniqueness key within a tenant', async () => {
    const organizationId = await createOrganization('BANK');
    const subject = subjectRef();
    const base = {
      organizationId,
      subjectRef: subject,
      purpose: 'PROTECT_PAYMENT' as const,
      scope: 'telecom-risk-signals:payment-protection',
      source: 'test',
    };
    await prisma.consentRecord.create({ data: { id: id('con'), ...base } });
    await expect(
      prisma.consentRecord.create({ data: { id: id('con'), ...base } }),
    ).rejects.toThrow();
  });

  it('enforces the idempotency key uniqueness (org, scope, key)', async () => {
    const organizationId = await createOrganization('BANK');
    const base = {
      organizationId,
      scope: 'POST /v1/payment-intents',
      key: 'partner-key-0001',
      requestHash: 'hash-a',
      correlationId: correlationId(),
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    await prisma.idempotencyKey.create({ data: { id: id('idem'), ...base } });
    await expect(
      prisma.idempotencyKey.create({ data: { id: id('idem'), ...base, requestHash: 'hash-b' } }),
    ).rejects.toThrow();
  });

  it('isolates tenants: the same subject + purpose is allowed across tenants and queries stay scoped', async () => {
    const bankA = await createOrganization('BANK');
    const bankB = await createOrganization('BANK');
    const subject = subjectRef();

    // The tenant-aware unique key permits the same subject/purpose in a different tenant.
    await prisma.consentRecord.create({
      data: { id: id('con'), organizationId: bankA, subjectRef: subject, purpose: 'PROTECT_PAYMENT', scope: 's', source: 'test' },
    });
    await prisma.consentRecord.create({
      data: { id: id('con'), organizationId: bankB, subjectRef: subject, purpose: 'PROTECT_PAYMENT', scope: 's', source: 'test' },
    });

    const forA = await prisma.consentRecord.findMany({ where: { organizationId: bankA } });
    const forB = await prisma.consentRecord.findMany({ where: { organizationId: bankB } });
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(forA[0]?.organizationId).toBe(bankA);
    // A tenant-scoped read never returns the other tenant's row.
    expect(forA.every((row) => row.organizationId === bankA)).toBe(true);
  });

  it('rolls back the whole transaction when any statement fails', async () => {
    const organizationId = await createOrganization('BANK');
    const before = await prisma.paymentIntent.count();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.paymentIntent.create({
          data: {
            id: id('pi'),
            organizationId,
            subjectRef: subjectRef(),
            amountMinor: BigInt(1000),
            currency: 'GBP',
            initiatedAt: new Date(),
            correlationId: correlationId(),
            source: 'test',
          },
        });
        // Second write violates the amount check, so the first must roll back too.
        await tx.paymentIntent.create({
          data: {
            id: id('pi'),
            organizationId,
            subjectRef: subjectRef(),
            amountMinor: BigInt(-5),
            currency: 'GBP',
            initiatedAt: new Date(),
            correlationId: correlationId(),
            source: 'test',
          },
        });
      }),
    ).rejects.toThrow();

    const after = await prisma.paymentIntent.count();
    expect(after).toBe(before);
  });

  it('paginates a list query deterministically using the ordering index', async () => {
    const organizationId = await createOrganization('BANK');
    const baseTime = Date.now();
    for (let index = 0; index < 25; index += 1) {
      await prisma.operationalEvent.create({
        data: {
          id: id('oe'),
          organizationId,
          type: 'risk.assessment.completed',
          provider: 'core',
          actor: 'core',
          payloadPreview: { index },
          correlationId: correlationId(),
          occurredAt: new Date(baseTime + index * 1000),
        },
      });
    }

    const pageSize = 10;
    const first = await prisma.operationalEvent.findMany({
      where: { organizationId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
    });
    expect(first).toHaveLength(pageSize);

    const second = await prisma.operationalEvent.findMany({
      where: { organizationId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      cursor: { id: first[first.length - 1]!.id },
      skip: 1,
    });
    expect(second).toHaveLength(pageSize);

    // Pages are disjoint and globally descending by time.
    const firstIds = new Set(first.map((row) => row.id));
    expect(second.every((row) => !firstIds.has(row.id))).toBe(true);
    expect(first[0]!.occurredAt.getTime()).toBeGreaterThan(first[pageSize - 1]!.occurredAt.getTime());
  });
});
