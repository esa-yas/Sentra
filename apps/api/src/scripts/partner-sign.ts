#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  CONTENT_DIGEST_PREFIX,
  PARTNER_SIGNING_HEADERS,
  buildCanonicalSigningString,
  canonicalizePath,
} from '@sentra/contracts';
import { signCanonicalRequest } from '@sentra/adapters';

/**
 * Local development signer. Reads a private JWK from disk so the browser never holds
 * partner signing material. Intended for sandbox credentials only.
 *
 * Usage:
 *   pnpm partner:sign --key ./private.jwk.json --method POST --path /v1/risk-events \
 *     --partner-id <id> --key-id <kid> --body ./body.json
 */
const args = process.argv.slice(2);
const get = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
};

const required = (name: string): string => {
  const value = get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing --${name}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const keyPath = required('key');
  const method = (get('method') ?? 'POST').toUpperCase();
  const path = canonicalizePath(required('path'));
  const partnerId = required('partner-id');
  const keyId = required('key-id');
  const bodyPath = get('body');
  const raw = bodyPath === undefined ? Buffer.alloc(0) : readFileSync(bodyPath);
  const privateKeyJwk = JSON.parse(readFileSync(keyPath, 'utf8')) as Record<string, unknown>;
  if (typeof privateKeyJwk['d'] !== 'string') {
    throw new Error('The JWK file must contain a private key component `d`.');
  }

  const timestamp = new Date().toISOString();
  const nonce = `nonce_${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 20)}`;
  const contentDigest = `${CONTENT_DIGEST_PREFIX}${createHash('sha256').update(raw).digest('base64url')}`;
  const canonical = {
    method,
    path,
    timestamp,
    nonce,
    contentDigest,
    partnerConnectionId: partnerId,
    keyId,
  };
  const signature = await signCanonicalRequest({
    canonical,
    privateKeyJwk,
    algorithm: 'ES256',
  });

  const headers = {
    [PARTNER_SIGNING_HEADERS.TIMESTAMP]: timestamp,
    [PARTNER_SIGNING_HEADERS.NONCE]: nonce,
    [PARTNER_SIGNING_HEADERS.PARTNER_ID]: partnerId,
    [PARTNER_SIGNING_HEADERS.KEY_ID]: keyId,
    [PARTNER_SIGNING_HEADERS.CONTENT_DIGEST]: contentDigest,
    [PARTNER_SIGNING_HEADERS.SIGNATURE]: signature,
  };

  process.stdout.write(
    `${JSON.stringify({ canonicalString: buildCanonicalSigningString(canonical), headers }, null, 2)}\n`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Signing failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
