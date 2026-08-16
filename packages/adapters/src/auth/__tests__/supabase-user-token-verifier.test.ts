import { InvalidTokenError } from '@sentra/contracts';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { describe, expect, it } from 'vitest';
import { createSupabaseUserTokenVerifier } from '../supabase-user-token-verifier';

/**
 * The verifier is exercised against locally-minted ES256 tokens and a local JWK set, so the
 * full path — issuer/audience/algorithm/not-before/expiry checks and asymmetric signature
 * verification — runs without touching Supabase or the network. A controllable clock lets the
 * expiry and not-before cases be asserted deterministically.
 */
const ISSUER = 'https://project.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

interface SignOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly alg?: 'ES256' | 'HS256';
  readonly subject?: string;
  readonly email?: string;
  readonly expiresInSeconds?: number;
  readonly notBeforeMs?: number;
}

const buildHarness = async () => {
  let current = new Date('2026-08-16T12:00:00.000Z');
  const clock = {
    now: () => new Date(current.getTime()),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };

  let keyPair = await generateKeyPair('ES256');
  let kid = 'kid-1';
  let jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keyPair.publicKey)), kid, alg: 'ES256', use: 'sig' } as JWK],
  });
  // Indirection through a mutable `jwks` lets a rotation swap the trusted key set.
  const keyResolver: JWTVerifyGetKey = (header, token) => jwks(header, token);

  const verifier = createSupabaseUserTokenVerifier({
    clock,
    issuer: ISSUER,
    audience: AUDIENCE,
    allowedAlgorithms: ['ES256'],
    clockToleranceSeconds: 0,
    keyResolver,
  });

  const sign = async (options: SignOptions = {}): Promise<string> => {
    const nowSeconds = Math.floor(clock.now().getTime() / 1_000);
    const alg = options.alg ?? 'ES256';
    const token = new SignJWT({
      aal: 'aal1',
      ...(options.email === undefined ? {} : { email: options.email }),
    })
      .setProtectedHeader({ alg, kid: alg === 'HS256' ? 'hs-1' : kid })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setSubject(options.subject ?? 'user-uuid-123')
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + (options.expiresInSeconds ?? 3_600));
    if (options.notBeforeMs !== undefined) {
      token.setNotBefore(Math.floor((clock.now().getTime() + options.notBeforeMs) / 1_000));
    }
    if (alg === 'HS256') {
      return token.sign(new TextEncoder().encode('symmetric-secret-the-verifier-does-not-hold'));
    }
    return token.sign(keyPair.privateKey);
  };

  const rotate = async (): Promise<void> => {
    keyPair = await generateKeyPair('ES256');
    kid = 'kid-2';
    jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(keyPair.publicKey)), kid, alg: 'ES256', use: 'sig' } as JWK],
    });
  };

  return { verifier, clock, sign, rotate };
};

describe('SupabaseUserTokenVerifier', () => {
  it('returns verified claims for a valid token', async () => {
    const h = await buildHarness();
    const verified = await h.verifier.verify(await h.sign({ email: 'ops@bank.test' }));
    expect(verified.subject).toBe('user-uuid-123');
    expect(verified.issuer).toBe(ISSUER);
    expect(verified.email).toBe('ops@bank.test');
    expect(verified.assuranceLevel).toBe('aal1');
    expect(verified.expiresAt.getTime()).toBeGreaterThan(h.clock.now().getTime());
  });

  it('rejects a malformed token', async () => {
    const h = await buildHarness();
    await expect(h.verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.verifier.verify('')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token before its not-before time', async () => {
    const h = await buildHarness();
    await expect(h.verifier.verify(await h.sign({ notBeforeMs: 60_000 }))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects a token once it has expired', async () => {
    const h = await buildHarness();
    const token = await h.sign({ expiresInSeconds: 300 });
    h.clock.advance(300_000);
    await expect(h.verifier.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects an unexpected issuer', async () => {
    const h = await buildHarness();
    await expect(
      h.verifier.verify(await h.sign({ issuer: 'https://evil.example' })),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects an unexpected audience', async () => {
    const h = await buildHarness();
    await expect(
      h.verifier.verify(await h.sign({ audience: 'someone-else' })),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a disallowed signing algorithm', async () => {
    const h = await buildHarness();
    await expect(h.verifier.verify(await h.sign({ alg: 'HS256' }))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('accepts a token from a rotated key and rejects the pre-rotation token', async () => {
    const h = await buildHarness();
    const before = await h.sign();
    await h.rotate();
    const after = await h.sign();
    await expect(h.verifier.verify(after)).resolves.toMatchObject({ subject: 'user-uuid-123' });
    await expect(h.verifier.verify(before)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
