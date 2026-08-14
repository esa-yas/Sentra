import { InvalidTokenError, PARTNER_SCOPES, PURPOSES } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import type { PartnerAuthProvider } from '@sentra/ports';

export interface PartnerAuthClock {
  now(): Date;
  advance(ms: number): void;
}

export interface PartnerAuthProviderContractHarness {
  readonly partnerAuth: PartnerAuthProvider;
  readonly clock: PartnerAuthClock;
  readonly registerValidClient: () => {
    clientId: string;
    clientSecret: string;
    organizationId: string;
    tokenTtlSeconds: number;
  };
}

export const describePartnerAuthProviderContract = (
  name: string,
  factory: () => PartnerAuthProviderContractHarness,
): void => {
  describe(`${name} PartnerAuthProvider`, () => {
    it('issues a token for valid client credentials', async () => {
      const { partnerAuth, registerValidClient } = factory();
      const client = registerValidClient();

      const issued = await partnerAuth.issueToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        requestedScopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE],
        requestedPurpose: PURPOSES.PROTECT_PAYMENT,
        correlationId: 'crl_partner_issue',
      });

      expect(issued.accessToken).toBeTruthy();
      expect(issued.grantedScopes).toContain(PARTNER_SCOPES.PAYMENT_INTENTS_WRITE);
      expect(issued.organizationId).toBe(client.organizationId);
    });

    it('rejects invalid client credentials without distinguishing unknown clients', async () => {
      const { partnerAuth, registerValidClient } = factory();
      const client = registerValidClient();

      await expect(
        partnerAuth.issueToken({
          clientId: client.clientId,
          clientSecret: 'wrong-secret',
          requestedScopes: [],
          correlationId: 'crl_partner_reject',
        }),
      ).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('verifies an issued token into a partner principal', async () => {
      const { partnerAuth, registerValidClient } = factory();
      const client = registerValidClient();

      const issued = await partnerAuth.issueToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        requestedScopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE],
        correlationId: 'crl_partner_verify',
      });

      const principal = await partnerAuth.verifyToken(issued.accessToken);
      expect(principal.kind).toBe('PARTNER');
      if (principal.kind === 'PARTNER') {
        expect(principal.organizationId).toBe(client.organizationId);
      }
    });

    it('accepts a token immediately before expiry', async () => {
      const { partnerAuth, clock, registerValidClient } = factory();
      const client = registerValidClient();
      const issued = await partnerAuth.issueToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        requestedScopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE],
        correlationId: 'crl_partner_before_expiry',
      });

      clock.advance(client.tokenTtlSeconds * 1000 - 1);
      await expect(partnerAuth.verifyToken(issued.accessToken)).resolves.toMatchObject({
        kind: 'PARTNER',
      });
    });

    it('rejects a token exactly at expiry', async () => {
      const { partnerAuth, clock, registerValidClient } = factory();
      const client = registerValidClient();
      const issued = await partnerAuth.issueToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        requestedScopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE],
        correlationId: 'crl_partner_at_expiry',
      });

      clock.advance(client.tokenTtlSeconds * 1000);
      await expect(partnerAuth.verifyToken(issued.accessToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token after expiry', async () => {
      const { partnerAuth, clock, registerValidClient } = factory();
      const client = registerValidClient();
      const issued = await partnerAuth.issueToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        requestedScopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE],
        correlationId: 'crl_partner_after_expiry',
      });

      clock.advance(client.tokenTtlSeconds * 1000 + 1);
      await expect(partnerAuth.verifyToken(issued.accessToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('exposes public verification keys', async () => {
      const { partnerAuth } = factory();
      const jwks = await partnerAuth.publicJwks();
      expect(jwks.keys.length).toBeGreaterThan(0);
    });
  });
};
