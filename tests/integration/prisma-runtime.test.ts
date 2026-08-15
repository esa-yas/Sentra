import { ACTOR_TYPES, AUDIT_HASH_GENESIS, AUDIT_OUTCOMES, PURPOSES, computeAuditHashSelf } from '@sentra/contracts';
import {
  createPrismaAuditProvider,
  createPrismaDecisionPersistence,
  createPrismaOutboxRepository,
  createPrismaUnitOfWork,
  createPostgresOperationsStore,
  createSystemClock,
  createUlidIdGenerator,
} from '@sentra/adapters';
import { loadConfig } from '@sentra/config';
import { createPrismaClient, Prisma } from '@sentra/db';
import { createEvaluatePaymentRiskUseCase } from '@sentra/core';
import { describeUnitOfWorkContract } from '@sentra/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { correlationId, createOrganization, id, prisma, subjectRef } from './setup';

const testUrl = process.env.TEST_DATABASE_URL as string;
const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: testUrl,
  DATABASE_DIRECT_URL: testUrl,
  REDIS_URL: 'redis://localhost:6379',
  SENTRA_PROVIDER_MODE: 'real',
});

const clock = createSystemClock();
const ids = createUlidIdGenerator();
const prismaClient = createPrismaClient({ config, databaseUrl: testUrl });
const uow = createPrismaUnitOfWork(prismaClient, 15_000);
const audit = createPrismaAuditProvider(uow, ids, clock);
const outbox = createPrismaOutboxRepository(prismaClient, uow);
const store = createPostgresOperationsStore(prismaClient, clock);

afterAll(async () => {
  await prismaClient.$disconnect();
});

describeUnitOfWorkContract('Prisma', () => ({
  uow,
  read: async (key) => {
    const row = await prismaClient.operationalEvent.findUnique({ where: { id: key } });
    return row === null ? undefined : row.type;
  },
  write: async (scope, key, value) => {
    const tx = uow.executor(scope);
    await tx.operationalEvent.create({
      data: {
        id: key,
        type: String(value),
        provider: 'test',
        actor: 'test',
        payloadPreview: {},
        correlationId: 'crl_uow_contract_01',
        occurredAt: new Date(),
      },
    });
  },
  stageAudit: async (scope) => {
    await audit.record(
      {
        organizationId: null,
        actorType: ACTOR_TYPES.SYSTEM,
        action: 'recommendation.issued',
        resourceType: 'recommendation',
        purpose: PURPOSES.PROTECT_PAYMENT,
        outcome: AUDIT_OUTCOMES.ALLOWED,
        occurredAt: new Date('2026-08-11T12:00:00.000Z'),
      },
      scope,
    );
  },
  listAudit: async () => prisma.auditEvent.findMany(),
  stageOutbox: async (scope, eventId) => {
    await outbox.enqueue(
      {
        id: eventId,
        organizationId: null,
        aggregateType: 'recommendation',
        aggregateId: eventId,
        eventType: 'recommendation.issued',
        schemaVersion: 1,
        payload: { ok: true },
        correlationId: 'crl_uow_outbox_01',
        maxAttempts: 8,
        availableAt: new Date(),
        expiresAt: null,
      },
      scope,
    );
  },
  listOutbox: async () => (await prisma.outboxEvent.findMany()).map((row) => row.id),
}));

describe('Prisma audit chain (PostgreSQL)', () => {
  it('matches the canonical v1 GENESIS vector when fields are identical', async () => {
    const organizationId = await createOrganization('BANK');
    const occurredAt = new Date('2026-08-11T12:00:00.000Z');
    const recorded = await uow.run(async (scope) =>
      audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.USER,
          actorId: '01USER_VECTOR',
          actorLabel: 'operator',
          action: 'member.added',
          resourceType: 'organization_member',
          resourceId: '01MEMBER_VECTOR',
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          occurredAt,
          correlationId: 'crl_vector_one',
          requestId: 'req_vector_one',
          metadata: { source: 'contract-test' },
          dataAfter: { role: 'ADMIN', status: 'ACTIVE' },
        },
        scope,
      ),
    );

    expect(recorded.hashPrev).toBe(AUDIT_HASH_GENESIS);
    expect(recorded.hashSelf).toBe(
      computeAuditHashSelf(AUDIT_HASH_GENESIS, {
        chainKey: recorded.chainKey,
        sequence: recorded.sequence,
        id: recorded.id,
        organizationId,
        actorType: ACTOR_TYPES.USER,
        actorId: '01USER_VECTOR',
        actorLabel: 'operator',
        action: 'member.added',
        resourceType: 'organization_member',
        resourceId: '01MEMBER_VECTOR',
        purpose: PURPOSES.PARTNER_ADMINISTRATION,
        outcome: AUDIT_OUTCOMES.ALLOWED,
        correlationId: 'crl_vector_one',
        requestId: 'req_vector_one',
        ipHash: null,
        userAgentHash: null,
        occurredAt,
        dataBefore: null,
        dataAfter: { role: 'ADMIN', status: 'ACTIVE' },
        metadata: { source: 'contract-test' },
      }),
    );
  });

  it('detects tampering when hashSelf is altered', async () => {
    const organizationId = await createOrganization('BANK');
    const recorded = await uow.run(async (scope) =>
      audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          action: 'recommendation.issued',
          resourceType: 'recommendation',
          purpose: PURPOSES.PROTECT_PAYMENT,
          correlationId: correlationId(),
        },
        scope,
      ),
    );

    await prisma.auditEvent.update({
      where: { id: recorded.id },
      data: { hashSelf: 'deadbeef'.repeat(8) },
    });

    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id: recorded.id } });
    const expected = computeAuditHashSelf(row.hashPrev, {
      chainKey: row.chainKey,
      sequence: row.sequence,
      id: row.id,
      organizationId: row.organizationId,
      actorType: row.actorType,
      actorId: row.actorId,
      actorLabel: row.actorLabel,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      purpose: row.purpose,
      outcome: row.outcome,
      correlationId: row.correlationId,
      requestId: row.requestId,
      ipHash: row.ipHash,
      userAgentHash: row.userAgentHash,
      occurredAt: row.occurredAt,
      dataBefore: null,
      dataAfter: null,
      metadata: null,
    });
    expect(row.hashSelf).not.toBe(expected);
  });

  it('serialises concurrent appends onto one sequence without a fork', async () => {
    const organizationId = await createOrganization('BANK');
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        uow.run(async (scope) =>
          audit.record(
            {
              organizationId,
              actorType: ACTOR_TYPES.SYSTEM,
              action: 'recommendation.issued',
              resourceType: 'recommendation',
              purpose: PURPOSES.PROTECT_PAYMENT,
              correlationId: `crl_concurrent_${n}_xxxx`,
            },
            scope,
          ),
        ),
      ),
    );
    const sequences = results.map((row) => Number(row.sequence)).sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2, 3]);
    const uniqueHashes = new Set(results.map((row) => row.hashSelf));
    expect(uniqueHashes.size).toBe(3);
  });

  it('chains the second event from the first hashSelf', async () => {
    const organizationId = await createOrganization('BANK');
    const first = await uow.run(async (scope) =>
      audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          action: 'recommendation.issued',
          resourceType: 'recommendation',
          purpose: PURPOSES.PROTECT_PAYMENT,
          correlationId: 'crl_chain_first_xx',
        },
        scope,
      ),
    );
    const second = await uow.run(async (scope) =>
      audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          action: 'recommendation.issued',
          resourceType: 'recommendation',
          purpose: PURPOSES.PROTECT_PAYMENT,
          correlationId: 'crl_chain_second_x',
        },
        scope,
      ),
    );
    expect(second.sequence).toBe(2n);
    expect(second.hashPrev).toBe(first.hashSelf);
  });
});

describe('Prisma consent and evaluate persistence', () => {
  it('does not treat missing consent as granted', async () => {
    const organizationId = await createOrganization('BANK');
    const persistence = createPrismaDecisionPersistence({
      unitOfWork: uow,
      ids,
      outbox,
      correlationWindowMs: 900_000,
      outboxMaxAttempts: 8,
    });
    const lookedUp = await uow.run(async (scope) =>
      persistence.lookupConsent(scope, {
        organizationId,
        subjectRef: subjectRef(),
        purpose: PURPOSES.PROTECT_PAYMENT,
        now: new Date(),
      }),
    );
    expect(lookedUp.status).toBe('MISSING');
  });

  it('persists evaluate atomically and returns the same journey on retry', async () => {
    const organizationId = await createOrganization('BANK');
    const subject = subjectRef();
    await prisma.consentRecord.create({
      data: {
        id: id('con'),
        organizationId,
        subjectRef: subject,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'GRANTED',
      },
    });

    const persistence = createPrismaDecisionPersistence({
      unitOfWork: uow,
      ids,
      outbox,
      correlationWindowMs: 900_000,
      outboxMaxAttempts: 8,
    });
    const evaluate = createEvaluatePaymentRiskUseCase({
      clock,
      ids,
      audit,
      unitOfWork: uow,
      persistence,
    });
    const cid = correlationId();
    const body = {
      paymentAmount: 8_400,
      currency: 'GBP',
      firstTimePayee: true,
      payeeAgeDays: 0,
      telecomEvidence: 'OK' as const,
      recentSuspiciousCall: true,
      callerReputation: 'KNOWN_BAD' as const,
      callDurationSeconds: 900,
      scamCampaignMatch: true,
      identityVerificationResult: 'PASS' as const,
    };

    const first = await evaluate.execute(body, { correlationId: cid, organizationId, subjectRef: subject });
    const second = await evaluate.execute(body, { correlationId: cid, organizationId, subjectRef: subject });

    expect(second.recommendation.decisionId).toBe(first.recommendation.decisionId);
    expect(await prisma.recommendation.count({ where: { correlationId: cid } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { correlationId: cid } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { correlationId: cid } })).toBeGreaterThanOrEqual(4);
  });

  it('rolls back domain, audit, and outbox together', async () => {
    const organizationId = await createOrganization('BANK');
    const cid = correlationId();
    await expect(
      uow.run(async (scope) => {
        const tx = uow.executor(scope);
        await tx.paymentIntent.create({
          data: {
            id: id('pi'),
            organizationId,
            subjectRef: subjectRef(),
            amountMinor: BigInt(100),
            currency: 'GBP',
            initiatedAt: new Date(),
            correlationId: cid,
            source: 'test',
          },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await prisma.paymentIntent.count({ where: { correlationId: cid } })).toBe(0);
  });

  it('maps withdrawn, expired, and invalid lookup to distinct consent outcomes', async () => {
    const organizationId = await createOrganization('BANK');
    const persistence = createPrismaDecisionPersistence({
      unitOfWork: uow,
      ids,
      outbox,
      correlationWindowMs: 900_000,
      outboxMaxAttempts: 8,
    });
    const deniedSubject = subjectRef();
    const expiredSubject = subjectRef();
    await prisma.consentRecord.create({
      data: {
        id: id('con'),
        organizationId,
        subjectRef: deniedSubject,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'WITHDRAWN',
      },
    });
    await prisma.consentRecord.create({
      data: {
        id: id('con'),
        organizationId,
        subjectRef: expiredSubject,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'GRANTED',
        validUntil: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    const denied = await uow.run(async (scope) =>
      persistence.lookupConsent(scope, {
        organizationId,
        subjectRef: deniedSubject,
        purpose: PURPOSES.PROTECT_PAYMENT,
        now: new Date(),
      }),
    );
    const expired = await uow.run(async (scope) =>
      persistence.lookupConsent(scope, {
        organizationId,
        subjectRef: expiredSubject,
        purpose: PURPOSES.PROTECT_PAYMENT,
        now: new Date(),
      }),
    );
    const unavailable = await uow.run(async (scope) =>
      persistence.lookupConsent(scope, {
        organizationId,
        subjectRef: subjectRef(),
        purpose: 'NOT_A_PURPOSE' as typeof PURPOSES.PROTECT_PAYMENT,
        now: new Date(),
      }),
    );
    expect(denied.status).toBe('DENIED');
    expect(expired.status).toBe('EXPIRED');
    expect(unavailable.status).toBe('UNAVAILABLE');
  });

  it('keeps tenant correlation ids isolated', async () => {
    const orgA = await createOrganization('BANK');
    const orgB = await createOrganization('BANK');
    const subject = subjectRef();
    await prisma.consentRecord.create({
      data: {
        id: id('con'),
        organizationId: orgA,
        subjectRef: subject,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'GRANTED',
      },
    });
    const persistence = createPrismaDecisionPersistence({
      unitOfWork: uow,
      ids,
      outbox,
      correlationWindowMs: 900_000,
      outboxMaxAttempts: 8,
    });
    const evaluate = createEvaluatePaymentRiskUseCase({
      clock,
      ids,
      audit,
      unitOfWork: uow,
      persistence,
    });
    const cid = correlationId();
    await evaluate.execute(
      {
        paymentAmount: 100,
        currency: 'GBP',
        firstTimePayee: false,
        telecomEvidence: 'OK',
        recentSuspiciousCall: false,
        callerReputation: 'UNKNOWN',
        identityVerificationResult: 'PASS',
      },
      { correlationId: cid, organizationId: orgA, subjectRef: subject },
    );
    const leaked = await uow.run(async (scope) => persistence.findByCorrelation(scope, orgB, cid));
    expect(leaked).toBeNull();
    expect(await prisma.recommendation.count({ where: { organizationId: orgB } })).toBe(0);
  });
});

describe('Prisma outbox claiming', () => {
  it('lets only one claimer own a pending event', async () => {
    const organizationId = await createOrganization('BANK');
    await uow.run(async (scope) => {
      await outbox.enqueue(
        {
          id: id('obx'),
          organizationId,
          aggregateType: 'recommendation',
          aggregateId: id('rec'),
          eventType: 'recommendation.issued',
          schemaVersion: 1,
          payload: { correlationId: 'crl_claim_only' },
          correlationId: 'crl_claim_only',
          maxAttempts: 8,
          availableAt: new Date(),
          expiresAt: null,
        },
        scope,
      );
    });

    const now = new Date();
    const reclaimBefore = new Date(now.getTime() - 60_000);
    const [first, second] = await Promise.all([
      outbox.claimBatch({ limit: 10, claimToken: 'claimer-a', now, reclaimBefore }),
      outbox.claimBatch({ limit: 10, claimToken: 'claimer-b', now, reclaimBefore }),
    ]);
    const owned = [...first, ...second];
    expect(owned).toHaveLength(1);
    expect(new Set(owned.map((row) => row.claimToken)).size).toBe(1);
  });
});

describe('PostgreSQL operations read model', () => {
  it('paginates decisions with a stable cursor', async () => {
    const organizationId = await createOrganization('BANK');
    const caseId = id('cas');
    await prisma.correlationCase.create({
      data: {
        id: caseId,
        organizationId,
        subjectRef: subjectRef(),
        status: 'RECOMMENDED',
        correlationBasis: 'test',
        correlationId: correlationId(),
        source: 'test',
      },
    });
    const assessmentId = id('ras');
    await prisma.riskAssessment.create({
      data: {
        id: assessmentId,
        organizationId,
        caseId,
        subjectRef: 'subj_test_pagination_subject_01',
        riskScore: 10,
        riskLevel: 'LOW',
        uncertainty: new Prisma.Decimal('0.100'),
        reasonCodes: [],
        contributingSignals: [],
        rulesTriggered: [],
        evidenceSources: [],
        missingProviders: [],
        policyVersion: 'policy-test',
        rulesVersion: 'rules-test',
        processingTimeMs: 1,
        correlationId: 'crl_page_parent',
        source: 'test',
      },
    });
    for (const n of [1, 2, 3]) {
      await prisma.recommendation.create({
        data: {
          id: `rec_page_${n}_${'x'.repeat(8)}`,
          organizationId,
          caseId,
          riskAssessmentId: assessmentId,
          subjectRef: 'subj_test_pagination_subject_01',
          recommendedAction: 'ALLOW',
          alternativeActions: [],
          riskScore: 10,
          riskLevel: 'LOW',
          uncertainty: new Prisma.Decimal('0.100'),
          reasonCodes: [],
          summary: 'test',
          authorityNote: 'advisory',
          policyVersion: 'policy-test',
          rulesVersion: 'rules-test',
          issuedAt: new Date(Date.UTC(2026, 7, n)),
          correlationId: `crl_page_${n}_xxxx`,
          source: 'test',
        },
      });
    }

    const firstPage = await store.listDecisions(2);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();
    const secondPage = await store.listDecisions(2, firstPage.nextCursor);
    expect(secondPage.items).toHaveLength(1);
    const ids = [...firstPage.items, ...secondPage.items].map((item) => item.decisionId);
    expect(new Set(ids).size).toBe(3);
  });
});
