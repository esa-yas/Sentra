import {
  AUDIT_HASH_GENESIS,
  auditChainKeyFor,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
  type AuditChainVerificationResponse,
  type AuditEventQuery,
  type AuditEventResponse,
} from '@sentra/contracts';
import type { Prisma, PrismaClient } from '@sentra/db';
import type { AuditEventList, AuditReadModel, Clock } from '@sentra/ports';

const LIST_CAP = 100;
const VERIFY_BATCH = 500;

type AuditRow = Prisma.AuditEventGetPayload<Record<string, never>>;

/** An audit row reduced to exactly the fields the hash chain is computed over, plus the digests. */
export interface VerifiableAuditEvent extends AuditCanonicalEvent {
  readonly hashPrev: string;
  readonly hashSelf: string;
}

/**
 * Recomputes a chain and reports whether it holds. Pure and adapter-independent so it can be
 * unit-tested without a database: for each event it rebuilds the canonical digest from the
 * stored fields and checks both that `hashSelf` matches and that `hashPrev` links to the prior
 * event. A single mismatch means a record was altered or removed — an incident, not a soft
 * failure — so it stops and reports the sequence where the chain broke.
 */
export const verifyChainEvents = (
  chainKey: string,
  events: readonly VerifiableAuditEvent[],
  now: Date,
): AuditChainVerificationResponse => {
  let hashPrev = AUDIT_HASH_GENESIS;
  let brokenAtSequence: bigint | null = null;
  let eventsVerified = 0;

  for (const event of events) {
    const expected = computeAuditHashSelf(hashPrev, event);
    if (event.hashPrev !== hashPrev || event.hashSelf !== expected) {
      brokenAtSequence = event.sequence;
      break;
    }
    hashPrev = event.hashSelf;
    eventsVerified += 1;
  }

  const first = events[0]?.sequence ?? null;
  const last = events.length > 0 ? events[events.length - 1]!.sequence : null;
  return {
    chainKey,
    valid: brokenAtSequence === null,
    eventsVerified,
    firstSequence: first === null ? null : first.toString(),
    lastSequence: last === null ? null : last.toString(),
    brokenAtSequence: brokenAtSequence === null ? null : brokenAtSequence.toString(),
    verifiedAt: now.toISOString(),
  };
};

const toResponse = (row: AuditRow): AuditEventResponse => ({
  id: row.id,
  sequence: row.sequence.toString(),
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
  occurredAt: row.occurredAt.toISOString(),
  metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  hashPrev: row.hashPrev,
  hashSelf: row.hashSelf,
});

const toVerifiable = (row: AuditRow): VerifiableAuditEvent => ({
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
  dataBefore: (row.dataBefore as Record<string, unknown> | null) ?? null,
  dataAfter: (row.dataAfter as Record<string, unknown> | null) ?? null,
  metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  hashPrev: row.hashPrev,
  hashSelf: row.hashSelf,
});

export class PrismaAuditReadStore implements AuditReadModel {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly maxVerifyEvents: number,
  ) {}

  public async listEvents(organizationId: string, query: AuditEventQuery): Promise<AuditEventList> {
    const take = Math.min(query.limit, LIST_CAP);
    const occurredAt: Prisma.DateTimeFilter = {};
    if (query.occurredAfter !== undefined) occurredAt.gte = new Date(query.occurredAfter);
    if (query.occurredBefore !== undefined) occurredAt.lte = new Date(query.occurredBefore);

    const rows = await this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
        ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
        ...(query.correlationId === undefined ? {} : { correlationId: query.correlationId }),
        ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
        ...(Object.keys(occurredAt).length === 0 ? {} : { occurredAt }),
      },
      orderBy: [{ sequence: 'desc' }],
      take: take + 1,
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    });

    const page = rows.slice(0, take);
    const result: AuditEventList = { items: page.map(toResponse) };
    if (rows.length > take) {
      return { ...result, nextCursor: page[page.length - 1]!.id };
    }
    return result;
  }

  public async verifyChain(organizationId: string): Promise<AuditChainVerificationResponse> {
    const chainKey = auditChainKeyFor(organizationId);
    const events: VerifiableAuditEvent[] = [];
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.auditEvent.findMany({
        where: { chainKey },
        orderBy: [{ sequence: 'asc' }],
        take: VERIFY_BATCH,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        events.push(toVerifiable(row));
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < VERIFY_BATCH || events.length >= this.maxVerifyEvents) break;
    }

    return verifyChainEvents(chainKey, events, this.clock.now());
  }
}

export const createPrismaAuditReadStore = (
  prisma: PrismaClient,
  clock: Clock,
  maxVerifyEvents: number,
): PrismaAuditReadStore => new PrismaAuditReadStore(prisma, clock, maxVerifyEvents);
