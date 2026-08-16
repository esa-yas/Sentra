import { CompactSign, importJWK } from 'jose';
import {
  SIGNATURE_FAILURE_REASONS,
  type PartnerSigningKeyRecord,
  type PartnerSigningKeyRepository,
} from '@sentra/ports';
import { SIGNING_ALGORITHMS, SIGNING_TEST_VECTOR, buildCanonicalSigningString } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import { createJwsSignatureVerifier } from '../jws-signature-verifier';
import { generateEs256KeyPair } from '../es256-keys';
import { canonicalBytes, contentDigestOf, signCanonicalRequest } from '../request-signing';

const clock = { now: () => new Date('2026-08-15T12:00:00.000Z'), monotonicMs: () => 0 };

const recordOf = (
  publicKeyJwk: Record<string, unknown>,
  overrides: Partial<PartnerSigningKeyRecord> = {},
): PartnerSigningKeyRecord => ({
  id: 'key_1',
  partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
  organizationId: 'org_telco',
  kid: SIGNING_TEST_VECTOR.keyId,
  algorithm: SIGNING_ALGORITHMS.ES256,
  publicKeyJwk,
  status: 'ACTIVE',
  notBefore: new Date('2026-01-01T00:00:00.000Z'),
  notAfter: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  revokedAt: null,
  lastUsedAt: null,
  ...overrides,
});

const repo = (rows: PartnerSigningKeyRecord[]): PartnerSigningKeyRepository =>
  ({
    findByOrganizationAndKid: async (organizationId, kid) =>
      rows.find((key) => key.organizationId === organizationId && key.kid === kid) ?? null,
    findActiveByOrganizationAndKid: async (organizationId, kid) =>
      rows.find((key) => key.organizationId === organizationId && key.kid === kid && key.status === 'ACTIVE') ?? null,
    register: async () => rows[0]!,
    listForConnection: async () => rows,
    revoke: async () => rows[0]!,
    touchLastUsed: async () => undefined,
  }) as PartnerSigningKeyRepository;

describe('JWS request signatures', () => {
  it('accepts the frozen developer test vector', async () => {
    const verifier = createJwsSignatureVerifier({
      keys: repo([recordOf({ ...SIGNING_TEST_VECTOR.publicKeyJwk })]),
      clock,
      allowedAlgorithms: ['ES256'],
      timestampSkewSeconds: 30,
      replayWindowSeconds: 300,
    });
    const result = await verifier.verify({
      organizationId: 'org_telco',
      partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
      keyId: SIGNING_TEST_VECTOR.keyId,
      payload: Buffer.from(SIGNING_TEST_VECTOR.canonicalString, 'utf8'),
      signature: SIGNING_TEST_VECTOR.signature,
      signedAt: new Date(SIGNING_TEST_VECTOR.timestamp),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a modified body, path, or method', async () => {
    const pair = await generateEs256KeyPair();
    const verifier = createJwsSignatureVerifier({
      keys: repo([recordOf(pair.publicKeyJwk as Record<string, unknown>)]),
      clock,
      allowedAlgorithms: ['ES256'],
      timestampSkewSeconds: 30,
      replayWindowSeconds: 300,
    });
    const canonical = {
      method: 'POST',
      path: '/v1/risk-events',
      timestamp: SIGNING_TEST_VECTOR.timestamp,
      nonce: SIGNING_TEST_VECTOR.nonce,
      contentDigest: contentDigestOf('{"ok":true}'),
      partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
      keyId: SIGNING_TEST_VECTOR.keyId,
    };
    const signature = await signCanonicalRequest({
      canonical,
      privateKeyJwk: pair.privateKeyJwk,
      algorithm: SIGNING_ALGORITHMS.ES256,
    });
    const check = async (input: typeof canonical) =>
      verifier.verify({
        organizationId: 'org_telco',
        partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
        keyId: SIGNING_TEST_VECTOR.keyId,
        payload: canonicalBytes(input),
        signature,
        signedAt: new Date(canonical.timestamp),
      });

    expect((await check(canonical)).valid).toBe(true);
    expect((await check({ ...canonical, path: '/v1/payment-intents' })).valid).toBe(false);
    expect((await check({ ...canonical, method: 'PUT' })).valid).toBe(false);
    expect((await check({ ...canonical, contentDigest: contentDigestOf('{"ok":false}') })).valid).toBe(false);
  });

  it('rejects none, unknown, revoked, expired, and malformed signatures', async () => {
    const pair = await generateEs256KeyPair();
    const rows = [recordOf(pair.publicKeyJwk as Record<string, unknown>)];
    const verifier = createJwsSignatureVerifier({
      keys: repo(rows),
      clock,
      allowedAlgorithms: ['ES256'],
      timestampSkewSeconds: 30,
      replayWindowSeconds: 300,
    });
    const payload = Buffer.from('hello', 'utf8');
    const signature = await new CompactSign(payload)
      .setProtectedHeader({ alg: 'ES256', kid: SIGNING_TEST_VECTOR.keyId, typ: 'sentra-sig+v1' })
      .sign(await importJWK(pair.privateKeyJwk, 'ES256'));

    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', kid: SIGNING_TEST_VECTOR.keyId }), 'utf8').toString(
      'base64url',
    );
    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: SIGNING_TEST_VECTOR.keyId,
          payload,
          signature: `${noneHeader}.${Buffer.from('hello').toString('base64url')}.`,
          signedAt: clock.now(),
        })
      ).reason,
    ).toBe(SIGNATURE_FAILURE_REASONS.ALGORITHM_NOT_ALLOWED);

    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: SIGNING_TEST_VECTOR.keyId,
          payload,
          signature: 'not-a-jws',
          signedAt: clock.now(),
        })
      ).reason,
    ).toBe(SIGNATURE_FAILURE_REASONS.MALFORMED_SIGNATURE);

    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: 'missing',
          payload,
          signature,
          signedAt: clock.now(),
        })
      ).reason,
    ).toBe(SIGNATURE_FAILURE_REASONS.UNKNOWN_KEY);

    rows[0] = { ...rows[0]!, status: 'REVOKED', revokedAt: clock.now() };
    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: SIGNING_TEST_VECTOR.keyId,
          payload,
          signature,
          signedAt: clock.now(),
        })
      ).reason,
    ).toBe(SIGNATURE_FAILURE_REASONS.KEY_NOT_ACTIVE);

    rows[0] = recordOf(pair.publicKeyJwk as Record<string, unknown>, {
      kid: 'kid-expired',
      notAfter: new Date('2026-01-01T00:00:00.000Z'),
    });
    const expiredSig = await new CompactSign(payload)
      .setProtectedHeader({ alg: 'ES256', kid: 'kid-expired', typ: 'sentra-sig+v1' })
      .sign(await importJWK(pair.privateKeyJwk, 'ES256'));
    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: 'kid-expired',
          payload,
          signature: expiredSig,
          signedAt: clock.now(),
        })
      ).reason,
    ).toBe(SIGNATURE_FAILURE_REASONS.KEY_OUTSIDE_VALIDITY_WINDOW);
  });

  it('accepts both keys during rotation overlap', async () => {
    const first = await generateEs256KeyPair();
    const second = await generateEs256KeyPair();
    const verifier = createJwsSignatureVerifier({
      keys: repo([
        recordOf(first.publicKeyJwk as Record<string, unknown>, { id: 'k1', kid: 'kid-a' }),
        recordOf(second.publicKeyJwk as Record<string, unknown>, { id: 'k2', kid: 'kid-b' }),
      ]),
      clock,
      allowedAlgorithms: ['ES256'],
      timestampSkewSeconds: 30,
      replayWindowSeconds: 300,
    });
    const payload = Buffer.from(
      buildCanonicalSigningString({
        method: 'POST',
        path: '/v1/risk-events',
        timestamp: SIGNING_TEST_VECTOR.timestamp,
        nonce: 'nonce_rotation_overlap01',
        contentDigest: contentDigestOf('{}'),
        partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
        keyId: 'kid-a',
      }),
      'utf8',
    );
    const sign = async (kid: string, jwk: Record<string, unknown>) =>
      new CompactSign(payload)
        .setProtectedHeader({ alg: 'ES256', kid, typ: 'sentra-sig+v1' })
        .sign(await importJWK(jwk, 'ES256'));

    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: 'kid-a',
          payload,
          signature: await sign('kid-a', first.privateKeyJwk as Record<string, unknown>),
          signedAt: clock.now(),
        })
      ).valid,
    ).toBe(true);
    expect(
      (
        await verifier.verify({
          organizationId: 'org_telco',
          partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
          keyId: 'kid-b',
          payload,
          signature: await sign('kid-b', second.privateKeyJwk as Record<string, unknown>),
          signedAt: clock.now(),
        })
      ).valid,
    ).toBe(true);
  });
});
