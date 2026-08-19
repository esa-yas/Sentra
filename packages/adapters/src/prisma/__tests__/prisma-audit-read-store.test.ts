import { AUDIT_HASH_GENESIS, computeAuditHashSelf, type AuditCanonicalEvent } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import { verifyChainEvents, type VerifiableAuditEvent } from '../prisma-audit-read-store';

const CHAIN = 'org:test-chain';
const NOW = new Date('2026-08-16T12:34:56.000Z');

const canonicalAt = (sequence: bigint): AuditCanonicalEvent => ({
  chainKey: CHAIN,
  sequence,
  id: `evt_${sequence}`,
  organizationId: 'org-1',
  actorType: 'USER',
  actorId: 'user-1',
  actorLabel: 'user:user-1',
  action: 'member.added',
  resourceType: 'organization_member',
  resourceId: `member_${sequence}`,
  purpose: 'PARTNER_ADMINISTRATION',
  outcome: 'ALLOWED',
  correlationId: `crl_${sequence}`,
  requestId: null,
  ipHash: null,
  userAgentHash: null,
  occurredAt: new Date('2026-08-16T12:00:00.000Z'),
  dataBefore: null,
  dataAfter: null,
  metadata: null,
});

/** Builds a genuine, correctly-linked chain the way the audit provider would. */
const buildChain = (length: number): VerifiableAuditEvent[] => {
  const events: VerifiableAuditEvent[] = [];
  let hashPrev = AUDIT_HASH_GENESIS;
  for (let i = 1; i <= length; i += 1) {
    const canonical = canonicalAt(BigInt(i));
    const hashSelf = computeAuditHashSelf(hashPrev, canonical);
    events.push({ ...canonical, hashPrev, hashSelf });
    hashPrev = hashSelf;
  }
  return events;
};

describe('verifyChainEvents', () => {
  it('verifies an intact chain', () => {
    const result = verifyChainEvents(CHAIN, buildChain(4), NOW);
    expect(result.valid).toBe(true);
    expect(result.eventsVerified).toBe(4);
    expect(result.firstSequence).toBe('1');
    expect(result.lastSequence).toBe('4');
    expect(result.brokenAtSequence).toBeNull();
    expect(result.verifiedAt).toBe(NOW.toISOString());
  });

  it('treats an empty chain as valid with nothing to verify', () => {
    const result = verifyChainEvents(CHAIN, [], NOW);
    expect(result.valid).toBe(true);
    expect(result.eventsVerified).toBe(0);
    expect(result.firstSequence).toBeNull();
    expect(result.lastSequence).toBeNull();
  });

  it('detects a tampered event body', () => {
    const chain = buildChain(4);
    // Alter the third event after the fact without recomputing its digest.
    chain[2] = { ...chain[2]!, action: 'member.removed' };
    const result = verifyChainEvents(CHAIN, chain, NOW);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe('3');
    expect(result.eventsVerified).toBe(2);
  });

  it('detects a severed link', () => {
    const chain = buildChain(4);
    // Break the back-link of the second event.
    chain[1] = { ...chain[1]!, hashPrev: 'not-the-previous-hash' };
    const result = verifyChainEvents(CHAIN, chain, NOW);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe('2');
  });
});
