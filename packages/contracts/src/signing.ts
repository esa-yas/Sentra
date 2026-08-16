import { z } from 'zod';

/**
 * Canonical partner request-signing format (Slice 4A).
 *
 * The signature binds method, path, timestamp, nonce, body digest, partner connection id
 * and key id. Proxies that reorder JSON keys or alter whitespace change the raw body and
 * therefore the digest, so they cannot produce an ambiguous valid signature.
 *
 * Compact JWS (ES256) is computed over the UTF-8 bytes of {@link buildCanonicalSigningString}.
 * The partner retains the private key; Sentra stores only the public JWK.
 *
 * See `docs/partner-signing.md` for the developer-facing protocol.
 */

export const SENTRA_SIGNATURE_VERSION = 'sentra-signature-v1';

export const SIGNING_ALGORITHMS = {
  ES256: 'ES256',
  ES384: 'ES384',
  EdDSA: 'EdDSA',
} as const;

export type SigningAlgorithm = (typeof SIGNING_ALGORITHMS)[keyof typeof SIGNING_ALGORITHMS];

export const ALL_SIGNING_ALGORITHMS: readonly SigningAlgorithm[] = Object.values(SIGNING_ALGORITHMS);

export const signingAlgorithmSchema = z.enum([
  SIGNING_ALGORITHMS.ES256,
  SIGNING_ALGORITHMS.ES384,
  SIGNING_ALGORITHMS.EdDSA,
]);

/** Algorithms that must never be accepted, even if a caller names them. */
export const FORBIDDEN_SIGNING_ALGORITHMS: readonly string[] = [
  'none',
  'None',
  'NONE',
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
];

export const PARTNER_SIGNING_HEADERS = {
  TIMESTAMP: 'x-sentra-timestamp',
  NONCE: 'x-sentra-nonce',
  PARTNER_ID: 'x-sentra-partner-id',
  KEY_ID: 'x-sentra-key-id',
  CONTENT_DIGEST: 'x-sentra-content-digest',
  SIGNATURE: 'x-sentra-signature',
} as const;

export const CONTENT_DIGEST_PREFIX = 'sha-256=';

export const nonceSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/, 'Must be a URL-safe nonce.');

export const contentDigestSchema = z
  .string()
  .regex(/^sha-256=[A-Za-z0-9_-]{43}$/, 'Must be sha-256=<base64url SHA-256>.');

export const signingTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z'), 'Timestamp must be UTC (RFC 3339 with a Z suffix).');

export interface CanonicalSigningInput {
  readonly method: string;
  readonly path: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly contentDigest: string;
  readonly partnerConnectionId: string;
  readonly keyId: string;
}

/**
 * Path used in the signature: no query string, no fragment, a single leading slash, and
 * no trailing slash except for the root. Host and scheme are omitted so a reverse proxy
 * cannot invalidate an otherwise honest request.
 */
export const canonicalizePath = (path: string): string => {
  const withoutHash = path.split('#')[0] ?? '';
  const withoutQuery = withoutHash.split('?')[0] ?? '';
  const withLeading = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.replace(/\/+$/, '');
  }
  return withLeading;
};

export const buildCanonicalSigningString = (input: CanonicalSigningInput): string =>
  [
    SENTRA_SIGNATURE_VERSION,
    input.method.trim().toUpperCase(),
    canonicalizePath(input.path),
    input.timestamp,
    input.nonce,
    input.contentDigest,
    input.partnerConnectionId,
    input.keyId,
  ].join('\n');

/**
 * Frozen developer test vector. Partners can reproduce this signature with the included
 * private JWK and the documented canonical string. The key is synthetic and must never be
 * used outside tests and local sandbox examples.
 */
export const SIGNING_TEST_VECTOR = {
  description: 'POST /v1/risk-events with a minimal synthetic body',
  algorithm: SIGNING_ALGORITHMS.ES256,
  method: 'POST',
  path: '/v1/risk-events',
  timestamp: '2026-08-15T12:00:00.000Z',
  nonce: 'nonce_test_vector_01',
  partnerConnectionId: '01K2ABCDEFGHJKMNPQRSTVWX01',
  keyId: 'kid-test-es256-1',
  body: '{"subjectRef":"subj_test_aaaaaaaaaaaaaaaaaaaa","eventType":"scam.risk.v1"}',
  contentDigest: 'sha-256=HizVahbE_ArVo2KFZRCVvWPpOxZjzIpfIrtpw1ABdy4',
  canonicalString:
    'sentra-signature-v1\nPOST\n/v1/risk-events\n2026-08-15T12:00:00.000Z\nnonce_test_vector_01\nsha-256=HizVahbE_ArVo2KFZRCVvWPpOxZjzIpfIrtpw1ABdy4\n01K2ABCDEFGHJKMNPQRSTVWX01\nkid-test-es256-1',
  signature:
    'eyJhbGciOiJFUzI1NiIsImtpZCI6ImtpZC10ZXN0LWVzMjU2LTEiLCJ0eXAiOiJzZW50cmEtc2lnK3YxIn0.c2VudHJhLXNpZ25hdHVyZS12MQpQT1NUCi92MS9yaXNrLWV2ZW50cwoyMDI2LTA4LTE1VDEyOjAwOjAwLjAwMFoKbm9uY2VfdGVzdF92ZWN0b3JfMDEKc2hhLTI1Nj1IaXpWYWhiRV9BclZvMktGWlJDVnZXUHBPeFpqeklwZklydHB3MUFCZHk0CjAxSzJBQkNERUZHSEpLTU5QUVJTVFZXWDAxCmtpZC10ZXN0LWVzMjU2LTE.rBuVtbYiHCHbzBLi_lrI35f3nORw7Qg4RKbx1R5uhTgtGXEuXmQJhzGEsij2y79Ofxr7hHv4yqV26huJGb5tqA',
  publicKeyJwk: {
    kty: 'EC',
    x: 'wKYlV91S0l0_nsTUgtDOmJkjj7712mYVJykAsRoV4NY',
    y: 'vZRsBADbwHfAf30ORYkIzPmzJCfxP9y7kRit7doXxBM',
    crv: 'P-256',
  },
  privateKeyJwk: {
    kty: 'EC',
    x: 'wKYlV91S0l0_nsTUgtDOmJkjj7712mYVJykAsRoV4NY',
    y: 'vZRsBADbwHfAf30ORYkIzPmzJCfxP9y7kRit7doXxBM',
    crv: 'P-256',
    d: 'vhXTL_HgpoNutsEmSgcqQ_UxhWMvkpJWlzRicGlBR5k',
  },
} as const;
