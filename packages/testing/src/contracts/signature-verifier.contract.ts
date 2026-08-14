import { describe, expect, it } from 'vitest';
import { SIGNATURE_FAILURE_REASONS } from '@sentra/ports';

export interface SignatureVerifierContractHarness {
  readonly verifier: {
    verify: (input: {
      organizationId: string;
      keyId: string;
      payload: Uint8Array;
      signature: string;
      signedAt: Date;
    }) => Promise<
      | { valid: true; keyId: string; algorithm: string }
      | { valid: false; reason: string }
    >;
  };
  readonly registerActiveKey: (input: {
    organizationId: string;
    keyId: string;
    algorithm: string;
  }) => void;
  readonly sign: (input: {
    organizationId: string;
    keyId: string;
    payload: Uint8Array;
  }) => string;
  readonly revokeKey: (organizationId: string, keyId: string) => void;
}

export const describeSignatureVerifierContract = (
  name: string,
  factory: () => SignatureVerifierContractHarness,
): void => {
  describe(`${name} SignatureVerifier`, () => {
    const payload = new TextEncoder().encode('{"event":"risk.v1"}');
    const organizationId = '01ORG_TELCO';
    const keyId = 'telco-key-1';

    it('accepts a valid signature from a registered active key', async () => {
      const harness = factory();
      harness.registerActiveKey({ organizationId, keyId, algorithm: 'ES256' });
      const signedAt = new Date();
      const signature = harness.sign({ organizationId, keyId, payload });

      const result = await harness.verifier.verify({
        organizationId,
        keyId,
        payload,
        signature,
        signedAt,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects an unknown key identifier', async () => {
      const harness = factory();

      const result = await harness.verifier.verify({
        organizationId,
        keyId: 'missing-key',
        payload,
        signature: 'deadbeef',
        signedAt: new Date(),
      });

      expect(result).toEqual({
        valid: false,
        reason: SIGNATURE_FAILURE_REASONS.UNKNOWN_KEY,
      });
    });

    it('rejects a signature that does not match the payload', async () => {
      const harness = factory();
      harness.registerActiveKey({ organizationId, keyId, algorithm: 'ES256' });

      const result = await harness.verifier.verify({
        organizationId,
        keyId,
        payload,
        signature: 'not-a-valid-signature-value',
        signedAt: new Date(),
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe(SIGNATURE_FAILURE_REASONS.SIGNATURE_INVALID);
      }
    });

    it('rejects signatures produced by a revoked key', async () => {
      const harness = factory();
      harness.registerActiveKey({ organizationId, keyId, algorithm: 'ES256' });
      const signature = harness.sign({ organizationId, keyId, payload });
      harness.revokeKey(organizationId, keyId);

      const result = await harness.verifier.verify({
        organizationId,
        keyId,
        payload,
        signature,
        signedAt: new Date(),
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe(SIGNATURE_FAILURE_REASONS.KEY_NOT_ACTIVE);
      }
    });
  });
};
