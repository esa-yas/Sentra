import { compactVerify, importJWK } from 'jose';
import { FORBIDDEN_SIGNING_ALGORITHMS, SIGNING_ALGORITHMS } from '@sentra/contracts';
import {
  SIGNATURE_FAILURE_REASONS,
  type Clock,
  type PartnerSigningKeyRepository,
  type SignatureVerificationInput,
  type SignatureVerificationResult,
  type SignatureVerifier,
} from '@sentra/ports';

export interface JwsSignatureVerifierOptions {
  readonly keys: PartnerSigningKeyRepository;
  readonly clock: Clock;
  readonly allowedAlgorithms: readonly string[];
  readonly timestampSkewSeconds: number;
  readonly replayWindowSeconds: number;
}

/**
 * Asymmetric JWS verifier for the canonical partner signing string.
 *
 * Delivery is verify-only: Sentra never stores the private key. Algorithms outside the
 * pinned allow-list (including `none` and HMAC) are rejected before cryptographic work.
 */
export class JwsSignatureVerifier implements SignatureVerifier {
  public constructor(private readonly options: JwsSignatureVerifierOptions) {}

  public async verify(input: SignatureVerificationInput): Promise<SignatureVerificationResult> {
    const key = await this.options.keys.findByOrganizationAndKid(input.organizationId, input.keyId);
    if (key === null) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.UNKNOWN_KEY };
    }
    if (key.organizationId !== input.organizationId) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.TENANT_MISMATCH };
    }
    if (key.partnerConnectionId !== input.partnerConnectionId) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.TENANT_MISMATCH };
    }
    if (key.status === 'REVOKED' || key.status === 'RETIRED') {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_NOT_ACTIVE };
    }

    const now = this.options.clock.now();
    if (now < key.notBefore) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_OUTSIDE_VALIDITY_WINDOW };
    }
    if (key.notAfter !== null && now > key.notAfter) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.KEY_OUTSIDE_VALIDITY_WINDOW };
    }

    const skewMs = this.options.timestampSkewSeconds * 1_000;
    if (input.signedAt.getTime() > now.getTime() + skewMs) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.OUTSIDE_REPLAY_WINDOW };
    }
    if (input.signedAt.getTime() < now.getTime() - this.options.replayWindowSeconds * 1_000) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.OUTSIDE_REPLAY_WINDOW };
    }

    const headerAlg = readProtectedAlgorithm(input.signature);
    if (headerAlg === null) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.MALFORMED_SIGNATURE };
    }
    if (
      FORBIDDEN_SIGNING_ALGORITHMS.includes(headerAlg) ||
      !this.options.allowedAlgorithms.includes(headerAlg)
    ) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.ALGORITHM_NOT_ALLOWED };
    }
    if (key.algorithm !== headerAlg) {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.ALGORITHM_NOT_ALLOWED };
    }

    try {
      const cryptoKey = await importJWK(key.publicKeyJwk, headerAlg);
      const verified = await compactVerify(input.signature, cryptoKey, {
        algorithms: [...this.options.allowedAlgorithms],
      });
      if (!bytesEqual(verified.payload, input.payload)) {
        return { valid: false, reason: SIGNATURE_FAILURE_REASONS.SIGNATURE_INVALID };
      }
      return { valid: true, keyId: key.kid, algorithm: headerAlg };
    } catch {
      return { valid: false, reason: SIGNATURE_FAILURE_REASONS.SIGNATURE_INVALID };
    }
  }
}

const readProtectedAlgorithm = (compact: string): string | null => {
  const parts = compact.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const json = Buffer.from(parts[0]!, 'base64url').toString('utf8');
    const header = JSON.parse(json) as { alg?: unknown };
    return typeof header.alg === 'string' ? header.alg : null;
  } catch {
    return null;
  }
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.byteLength; i += 1) {
    mismatch |= left[i]! ^ right[i]!;
  }
  return mismatch === 0;
};

export const createJwsSignatureVerifier = (options: JwsSignatureVerifierOptions): JwsSignatureVerifier =>
  new JwsSignatureVerifier(options);

export { SIGNING_ALGORITHMS };
