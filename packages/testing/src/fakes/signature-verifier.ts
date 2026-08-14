import { createHash, timingSafeEqual } from 'node:crypto';
import {
  SIGNATURE_FAILURE_REASONS,
  type SignatureFailureReason,
  type SignatureVerificationInput,
  type SignatureVerificationResult,
  type SignatureVerifier,
} from '@sentra/ports';

export type FakeSigningKeyStatus = 'ACTIVE' | 'RETIRED' | 'REVOKED';

export interface FakeSigningKey {
  readonly organizationId: string;
  readonly kid: string;
  readonly algorithm: string;
  readonly secret: string;
  readonly status: FakeSigningKeyStatus;
  readonly notBefore: Date;
  readonly notAfter: Date | null;
}

export interface FakeSignatureVerifierOptions {
  readonly replayWindowSeconds?: number;
  readonly clockSkewSeconds?: number;
  readonly now?: () => Date;
}

/**
 * Verifies detached signatures against registered public keys, including tenant binding,
 * key validity windows, and replay protection.
 */
export class FakeSignatureVerifier implements SignatureVerifier {
  private readonly keys = new Map<string, FakeSigningKey>();
  private readonly replayWindowSeconds: number;
  private readonly clockSkewSeconds: number;
  private readonly now: () => Date;

  public constructor(options: FakeSignatureVerifierOptions = {}) {
    this.replayWindowSeconds = options.replayWindowSeconds ?? 300;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
    this.now = options.now ?? (() => new Date());
  }

  public registerKey(key: FakeSigningKey): void {
    this.keys.set(this.keyLookup(key.organizationId, key.kid), key);
  }

  /** Produces a signature the fake will accept for {@link input}. Test helper. */
  public sign(input: Pick<SignatureVerificationInput, 'organizationId' | 'keyId' | 'payload'>): string {
    const key = this.keys.get(this.keyLookup(input.organizationId, input.keyId));
    if (key === undefined) {
      throw new Error(`Unknown signing key ${input.keyId}.`);
    }
    return this.computeSignature(input.payload, key.secret);
  }

  public async verify(input: SignatureVerificationInput): Promise<SignatureVerificationResult> {
    const key = this.keys.get(this.keyLookup(input.organizationId, input.keyId));
    if (key === undefined) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.UNKNOWN_KEY };
    }

    if (key.organizationId !== input.organizationId) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.TENANT_MISMATCH };
    }

    if (key.status === 'REVOKED') {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_NOT_ACTIVE };
    }
    if (key.status === 'RETIRED') {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_NOT_ACTIVE };
    }

    const current = this.now();
    if (input.signedAt < key.notBefore) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_OUTSIDE_VALIDITY_WINDOW };
    }
    if (key.notAfter !== null && input.signedAt > key.notAfter) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_OUTSIDE_VALIDITY_WINDOW };
    }

    const skewMs = this.clockSkewSeconds * 1000;
    if (input.signedAt.getTime() > current.getTime() + skewMs) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.OUTSIDE_REPLAY_WINDOW };
    }
    if (input.signedAt.getTime() < current.getTime() - this.replayWindowSeconds * 1000) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.OUTSIDE_REPLAY_WINDOW };
    }

    const expected = this.computeSignature(input.payload, key.secret);
    if (!this.safeEqual(expected, input.signature)) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.SIGNATURE_INVALID };
    }

    return { valid: true, keyId: key.kid, algorithm: key.algorithm };
  }

  private keyLookup(organizationId: string, kid: string): string {
    return `${organizationId}:${kid}`;
  }

  private computeSignature(payload: Uint8Array, secret: string): string {
    return createHash('sha256').update(secret).update(payload).digest('hex');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}

export const createFakeSignatureVerifier = (
  options?: FakeSignatureVerifierOptions,
): FakeSignatureVerifier => new FakeSignatureVerifier(options);

export type { SignatureFailureReason, SignatureVerificationResult };
