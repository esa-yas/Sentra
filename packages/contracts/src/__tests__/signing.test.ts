import { createHash } from 'node:crypto';
import {
  CONTENT_DIGEST_PREFIX,
  SIGNING_TEST_VECTOR,
  buildCanonicalSigningString,
  canonicalizePath,
} from '@sentra/contracts';
import { describe, expect, it } from 'vitest';

describe('canonical partner signing format', () => {
  it('joins the documented fields with LF and no trailing newline', () => {
    const canonical = buildCanonicalSigningString({
      method: 'post',
      path: '/v1/risk-events/',
      timestamp: '2026-08-15T12:00:00.000Z',
      nonce: 'nonce_test_vector_01',
      contentDigest: SIGNING_TEST_VECTOR.contentDigest,
      partnerConnectionId: SIGNING_TEST_VECTOR.partnerConnectionId,
      keyId: SIGNING_TEST_VECTOR.keyId,
    });

    expect(canonical).toBe(SIGNING_TEST_VECTOR.canonicalString);
    expect(canonical.endsWith('\n')).toBe(false);
    expect(canonicalizePath('/v1/risk-events/?x=1#y')).toBe('/v1/risk-events');
  });

  it('binds the raw body into the content digest', () => {
    const digest = `${CONTENT_DIGEST_PREFIX}${createHash('sha256')
      .update(SIGNING_TEST_VECTOR.body, 'utf8')
      .digest('base64url')}`;
    expect(digest).toBe(SIGNING_TEST_VECTOR.contentDigest);
  });
});
