import { createHash } from 'node:crypto';
import { CompactSign, importJWK, type JWK } from 'jose';
import {
  CONTENT_DIGEST_PREFIX,
  buildCanonicalSigningString,
  type CanonicalSigningInput,
  type SigningAlgorithm,
} from '@sentra/contracts';

export const contentDigestOf = (body: Buffer | Uint8Array | string): string => {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  return `${CONTENT_DIGEST_PREFIX}${createHash('sha256').update(bytes).digest('base64url')}`;
};

export const canonicalBytes = (input: CanonicalSigningInput): Uint8Array =>
  Buffer.from(buildCanonicalSigningString(input), 'utf8');

export const signCanonicalRequest = async (input: {
  readonly canonical: CanonicalSigningInput;
  readonly privateKeyJwk: JWK;
  readonly algorithm: SigningAlgorithm;
}): Promise<string> => {
  const key = await importJWK(input.privateKeyJwk, input.algorithm);
  return new CompactSign(canonicalBytes(input.canonical))
    .setProtectedHeader({
      alg: input.algorithm,
      kid: input.canonical.keyId,
      typ: 'sentra-sig+v1',
    })
    .sign(key);
};
