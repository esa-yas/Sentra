import { InvalidTokenError } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import type { UserTokenVerifier } from '@sentra/ports';

export interface UserTokenVerifierContractHarness {
  readonly verifier: UserTokenVerifier;
  readonly clock: { now(): Date; advance(ms: number): void };
  readonly registerValidToken: () => { rawToken: string; expiresInSeconds: number };
  readonly registerTokenNotYetValid: () => string;
  readonly registerTokenWithIssuer: (issuer: string) => string;
  readonly registerTokenWithAudience: (audience: string) => string;
  readonly registerTokenWithAlgorithm: (algorithm: string) => string;
  readonly rotateToken: (oldToken: string) => string;
}

export const describeUserTokenVerifierContract = (
  name: string,
  factory: () => UserTokenVerifierContractHarness,
): void => {
  describe(`${name} UserTokenVerifier`, () => {
    it('returns verified claims for a valid token', async () => {
      const { verifier, registerValidToken, clock } = factory();
      const token = registerValidToken();

      const verified = await verifier.verify(token.rawToken);
      expect(verified.subject).toBeTruthy();
      expect(verified.expiresAt.getTime()).toBeGreaterThan(clock.now().getTime());
    });

    it('rejects an unknown or malformed token', async () => {
      const { verifier } = factory();
      await expect(verifier.verify('not-a-real-token')).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token before its not-before time', async () => {
      const { verifier, registerTokenNotYetValid } = factory();
      const rawToken = registerTokenNotYetValid();
      await expect(verifier.verify(rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token exactly at expiry', async () => {
      const { verifier, clock, registerValidToken } = factory();
      const token = registerValidToken();
      clock.advance(token.expiresInSeconds * 1000);
      await expect(verifier.verify(token.rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token with an unexpected issuer', async () => {
      const { verifier, registerTokenWithIssuer } = factory();
      const rawToken = registerTokenWithIssuer('https://wrong.example');
      await expect(verifier.verify(rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token with an unexpected audience', async () => {
      const { verifier, registerTokenWithAudience } = factory();
      const rawToken = registerTokenWithAudience('wrong-audience');
      await expect(verifier.verify(rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a disallowed signing algorithm', async () => {
      const { verifier, registerTokenWithAlgorithm } = factory();
      const rawToken = registerTokenWithAlgorithm('HS256');
      await expect(verifier.verify(rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('accepts a rotated signing key represented by a new token', async () => {
      const { verifier, registerValidToken, rotateToken } = factory();
      const first = registerValidToken();
      const rotated = rotateToken(first.rawToken);
      await expect(verifier.verify(rotated)).resolves.toBeTruthy();
      await expect(verifier.verify(first.rawToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });
  });
};
