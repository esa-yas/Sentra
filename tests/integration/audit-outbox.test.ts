import { describe, expect, it } from 'vitest';
import { createOrganization, correlationId, id, prisma, subjectRef } from './setup';

const auditData = (chainKey: string, sequence: number, organizationId: string) => ({
  id: id('aud'),
  chainKey,
  sequence: BigInt(sequence),
  organizationId,
  actorType: 'SYSTEM' as const,
  action: 'recommendation.issued',
  resourceType: 'recommendation',
  purpose: 'PROTECT_PAYMENT' as const,
  correlationId: correlationId(),
  occurredAt: new Date(),
  hashPrev: `prev-${sequence}`,
  hashSelf: `self-${chainKey}-${sequence}`,
});

describe('audit chain', () => {
  it('preserves per-chain sequence ordering', async () => {
    const organizationId = await createOrganization('BANK');
    const chainKey = `org:${organizationId}`;
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      await prisma.auditEvent.create({ data: auditData(chainKey, sequence, organizationId) });
    }
    const rows = await prisma.auditEvent.findMany({
      where: { chainKey },
      orderBy: { sequence: 'asc' },
    });
    expect(rows.map((row) => Number(row.sequence))).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects a duplicate sequence in the same chain (unique chainKey, sequence)', async () => {
    const organizationId = await createOrganization('BANK');
    const chainKey = `org:${organizationId}`;
    await prisma.auditEvent.create({ data: auditData(chainKey, 1, organizationId) });
    await expect(
      prisma.auditEvent.create({ data: auditData(chainKey, 1, organizationId) }),
    ).rejects.toThrow();
  });

  it('lets exactly one of two concurrent writers take a given sequence', async () => {
    const organizationId = await createOrganization('BANK');
    const chainKey = `org:${organizationId}`;
    const results = await Promise.allSettled([
      prisma.auditEvent.create({ data: auditData(chainKey, 7, organizationId) }),
      prisma.auditEvent.create({ data: auditData(chainKey, 7, organizationId) }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe('transactional outbox', () => {
  it('commits a domain change and its outbox row atomically', async () => {
    const organizationId = await createOrganization('BANK');
    const cid = correlationId();

    await prisma.$transaction(async (tx) => {
      await tx.operationalEvent.create({
        data: {
          id: id('oe'),
          organizationId,
          type: 'decision.recommendation.issued',
          provider: 'core',
          actor: 'core',
          payloadPreview: { ok: true },
          correlationId: cid,
          occurredAt: new Date(),
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: id('obx'),
          organizationId,
          aggregateType: 'recommendation',
          aggregateId: id('rec'),
          eventType: 'recommendation.issued',
          payload: { correlationId: cid },
          correlationId: cid,
        },
      });
    });

    expect(await prisma.operationalEvent.count({ where: { correlationId: cid } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { correlationId: cid } })).toBe(1);
  });

  it('writes neither row when the transaction fails (no orphaned outbox event)', async () => {
    const organizationId = await createOrganization('BANK');
    const cid = correlationId();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.outboxEvent.create({
          data: {
            id: id('obx'),
            organizationId,
            aggregateType: 'recommendation',
            aggregateId: id('rec'),
            eventType: 'recommendation.issued',
            payload: { correlationId: cid },
            correlationId: cid,
          },
        });
        throw new Error('domain write failed after staging the outbox row');
      }),
    ).rejects.toThrow();

    expect(await prisma.outboxEvent.count({ where: { correlationId: cid } })).toBe(0);
  });

  it('claims a pending row exclusively under concurrency (FOR UPDATE SKIP LOCKED)', async () => {
    const organizationId = await createOrganization('BANK');
    await prisma.outboxEvent.create({
      data: {
        id: id('obx'),
        organizationId,
        aggregateType: 'recommendation',
        aggregateId: id('rec'),
        eventType: 'recommendation.issued',
        payload: {},
        correlationId: correlationId(),
      },
    });

    const claim = async (token: string): Promise<string | null> =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM outbox_events
             WHERE status = 'PENDING' AND "availableAt" <= now()
             ORDER BY "availableAt" ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1;`,
        );
        if (rows.length === 0) {
          return null;
        }
        const rowId = rows[0]!.id;
        await tx.$executeRawUnsafe(
          `UPDATE outbox_events SET status = 'PUBLISHING', "claimedAt" = now(), "claimToken" = $1 WHERE id = $2;`,
          token,
          rowId,
        );
        return rowId;
      });

    const [a, b] = await Promise.all([claim('worker-a'), claim('worker-b')]);
    const claimed = [a, b].filter((value) => value !== null);
    expect(claimed).toHaveLength(1);

    const row = await prisma.outboxEvent.findFirstOrThrow();
    expect(row.status).toBe('PUBLISHING');
    expect(row.claimToken).not.toBeNull();
  });
});

describe('inbox deduplication', () => {
  it('rejects a duplicate (source, externalId) so at-least-once delivery is safe', async () => {
    const base = {
      source: 'worker.domain-events',
      externalId: 'evt-0001',
      eventType: 'recommendation.issued',
      correlationId: correlationId(),
    };
    await prisma.inboxEvent.create({ data: { id: id('inb'), ...base } });
    await expect(
      prisma.inboxEvent.create({ data: { id: id('inb'), ...base } }),
    ).rejects.toThrow();

    // A different consumer processing the same external id is still allowed.
    await prisma.inboxEvent.create({
      data: { id: id('inb'), ...base, source: 'worker.analytics' },
    });
    expect(await prisma.inboxEvent.count({ where: { externalId: 'evt-0001' } })).toBe(2);
  });

  it('records a customer notification only once per dedupe key', async () => {
    const organizationId = await createOrganization('BANK');
    const dedupeKey = `warn:${correlationId()}`;
    const base = {
      organizationId,
      subjectRef: subjectRef(),
      channel: 'PUSH' as const,
      notificationType: 'scam_warning',
      dedupeKey,
      correlationId: correlationId(),
      source: 'test',
    };
    await prisma.notificationRecord.create({ data: { id: id('ntf'), ...base } });
    await expect(
      prisma.notificationRecord.create({ data: { id: id('ntf'), ...base } }),
    ).rejects.toThrow();
  });
});
