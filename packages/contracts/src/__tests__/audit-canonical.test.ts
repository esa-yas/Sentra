import { describe, expect, it } from 'vitest';
import {
  AUDIT_HASH_GENESIS,
  buildCanonicalAuditEventText,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
} from '../audit-canonical';

const vectorOne: AuditCanonicalEvent = {
  chainKey: 'org:01ORG_VECTOR_ONE',
  sequence: 1n,
  id: '01AUDIT000000000000000001',
  organizationId: '01ORG_VECTOR_ONE',
  actorType: 'USER',
  actorId: '01USER_VECTOR',
  actorLabel: 'operator',
  action: 'member.added',
  resourceType: 'organization_member',
  resourceId: '01MEMBER_VECTOR',
  purpose: 'PARTNER_ADMINISTRATION',
  outcome: 'ALLOWED',
  correlationId: 'crl_vector_one',
  requestId: 'req_vector_one',
  ipHash: null,
  userAgentHash: null,
  occurredAt: new Date('2026-08-11T12:00:00.000Z'),
  dataBefore: null,
  dataAfter: { role: 'ADMIN', status: 'ACTIVE' },
  metadata: { source: 'contract-test' },
};

const vectorTwo: AuditCanonicalEvent = {
  ...vectorOne,
  sequence: 2n,
  id: '01AUDIT000000000000000002',
  action: 'member.role_changed',
  dataBefore: { role: 'ADMIN' },
  dataAfter: { role: 'ANALYST' },
  metadata: { source: 'contract-test', nested: { z: 1, a: 2 } },
};

describe('audit canonicalization v1', () => {
  it('sorts nested object keys deterministically', () => {
    const text = buildCanonicalAuditEventText(vectorTwo);
    expect(text).toContain('{a:2,z:1}');
  });

  it('matches fixed vector one canonical text', () => {
    expect(buildCanonicalAuditEventText(vectorOne)).toBe(
      [
        '1',
        'org:01ORG_VECTOR_ONE',
        '1',
        '01AUDIT000000000000000001',
        '01ORG_VECTOR_ONE',
        'USER',
        '01USER_VECTOR',
        'operator',
        'member.added',
        'organization_member',
        '01MEMBER_VECTOR',
        'PARTNER_ADMINISTRATION',
        'ALLOWED',
        'crl_vector_one',
        'req_vector_one',
        '',
        '',
        '2026-08-11T12:00:00.000Z',
        '',
        '{role:ADMIN,status:ACTIVE}',
        '{source:contract-test}',
      ].join('\u001f'),
    );
  });

  it('matches fixed vector one hashSelf from GENESIS', () => {
    expect(computeAuditHashSelf(AUDIT_HASH_GENESIS, vectorOne)).toBe(
      '05127e5a4a15e9ce9753edca399ef8077da58d13c50b3b28d8da3e8cbb512b47',
    );
  });

  it('chains vector two from vector one hashSelf', () => {
    const hashOne = computeAuditHashSelf(AUDIT_HASH_GENESIS, vectorOne);
    expect(computeAuditHashSelf(hashOne, vectorTwo)).toBe(
      'c574eaedd3300eef1efaa8fa9c8b0360c357de2f363be62e97a0c7072e65b756',
    );
  });
});
