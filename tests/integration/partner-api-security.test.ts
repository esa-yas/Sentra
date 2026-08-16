import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { RequestListener } from 'node:http';
import {
  HTTP_HEADERS,
  PARTNER_CONNECTION_KINDS,
  PARTNER_ENVIRONMENTS,
  PARTNER_SCOPES,
  PARTNER_SIGNING_HEADERS,
  PURPOSES,
  SIGNING_ALGORITHMS,
} from '@sentra/contracts';
import { contentDigestOf, signCanonicalRequest } from '@sentra/adapters';
import { SYNTHETIC_BANK_SLUG, SYNTHETIC_DEMO_SUBJECT_REF, SYNTHETIC_TELECOM_SLUG } from '@sentra/core';
import { createNullLogger } from '@sentra/observability';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import { buildContainer } from '../../apps/api/src/container';
import { loadConfig } from '@sentra/config';
import { createOrganization, prisma } from './setup';
import { TEST_CACHE_PREFIX, TEST_REDIS_URL, flushTestRedis } from './queue-helpers';

const testUrl = process.env.TEST_DATABASE_URL as string;
const BOOTSTRAP = 'it-bootstrap-token-not-for-production';

const telecomBody = {
  subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
  eventType: 'scam.risk.v1',
  recentSuspiciousCall: true,
  callerReputation: 'KNOWN_BAD',
  callDurationSeconds: 90,
  scamCampaignMatch: true,
};

const listen = async (app: RequestListener): Promise<{ server: Server; origin: string }> =>
  new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Failed to bind test server.');
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });

const close = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

const json = async (
  origin: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<HttpResult> => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
};

const signedHeaders = async (input: {
  method: string;
  path: string;
  body: Buffer;
  partnerId: string;
  keyId: string;
  privateKeyJwk: Record<string, unknown>;
  nonce?: string;
  timestamp?: string;
}): Promise<Record<string, string>> => {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce =
    input.nonce ?? `nonce_${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 18)}`;
  const digest = contentDigestOf(input.body);
  const signature = await signCanonicalRequest({
    canonical: {
      method: input.method,
      path: input.path,
      timestamp,
      nonce,
      contentDigest: digest,
      partnerConnectionId: input.partnerId,
      keyId: input.keyId,
    },
    privateKeyJwk: input.privateKeyJwk,
    algorithm: SIGNING_ALGORITHMS.ES256,
  });
  return {
    [PARTNER_SIGNING_HEADERS.TIMESTAMP]: timestamp,
    [PARTNER_SIGNING_HEADERS.NONCE]: nonce,
    [PARTNER_SIGNING_HEADERS.PARTNER_ID]: input.partnerId,
    [PARTNER_SIGNING_HEADERS.KEY_ID]: input.keyId,
    [PARTNER_SIGNING_HEADERS.CONTENT_DIGEST]: digest,
    [PARTNER_SIGNING_HEADERS.SIGNATURE]: signature,
    [HTTP_HEADERS.IDEMPOTENCY_KEY]: `idem_${nonce}`,
  };
};

describe('partner API security', () => {
  let disconnect: (() => Promise<void>) | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await close(server);
      server = undefined;
    }
    if (disconnect !== undefined) {
      await disconnect();
      disconnect = undefined;
    }
    await flushTestRedis();
  });

  const boot = async (overrides: Record<string, string> = {}) => {
    const telecomId = await createOrganization('TELECOM');
    const bankId = await createOrganization('BANK');
    await prisma.organization.update({ where: { id: telecomId }, data: { slug: SYNTHETIC_TELECOM_SLUG } });
    await prisma.organization.update({ where: { id: bankId }, data: { slug: SYNTHETIC_BANK_SLUG } });
    await prisma.consentRecord.create({
      data: {
        id: `con_${bankId.slice(0, 16)}`,
        organizationId: bankId,
        subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'GRANTED',
      },
    });

    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      DATABASE_DIRECT_URL: testUrl,
      REDIS_URL: TEST_REDIS_URL,
      REDIS_KEY_PREFIX: TEST_CACHE_PREFIX,
      SENTRA_PROVIDER_MODE: 'real',
      PARTNER_BOOTSTRAP_ENABLED: 'true',
      PARTNER_BOOTSTRAP_TOKEN: BOOTSTRAP,
      RATE_LIMIT_PARTNER_WRITE_MAX_REQUESTS: '8',
      RATE_LIMIT_PARTNER_ENDPOINT_MAX_REQUESTS: '8',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
      ...overrides,
    });
    const container = await buildContainer(config, createNullLogger());
    disconnect = container.disconnect;
    const bound = await listen(createApp(container));
    server = bound.server;
    return { origin: bound.origin, telecomId, bankId };
  };

  const createTelecom = async (origin: string, organizationId: string) => {
    const created = await json(
      origin,
      'POST',
      `/v1/organizations/${organizationId}/partner-connections`,
      { [HTTP_HEADERS.BOOTSTRAP_TOKEN]: BOOTSTRAP },
      {
        name: 'meridian sandbox',
        kind: PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
        environment: PARTNER_ENVIRONMENTS.SANDBOX,
        scopes: [PARTNER_SCOPES.RISK_EVENTS_WRITE],
        allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
      },
    );
    expect(created.status).toBe(201);
    const body = created.body as {
      connection: { id: string; organizationId: string };
      signing: { kid: string; privateKeyJwk: Record<string, unknown> };
      clientSecret: string;
    };
    expect(body.signing.privateKeyJwk.d).toBeTruthy();
    const again = await json(origin, 'GET', `/v1/organizations/${organizationId}/partner-connections`);
    expect(again.status).toBe(404);
    return body;
  };

  it('creates a sandbox telecom credential once and verifies the signed ingest path', async () => {
    const { origin, telecomId, bankId } = await boot();
    const cred = await createTelecom(origin, telecomId);
    const raw = Buffer.from(JSON.stringify(telecomBody), 'utf8');
    const headers = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });

    const first = await json(origin, 'POST', '/v1/risk-events', headers, telecomBody);
    expect(first.status).toBe(200);
    expect(first.body.organizationId).toBe(telecomId);
    expect(first.body.synthetic).toBe(true);
    const eventId = first.body.id as string;

    const retryHeaders = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    retryHeaders[HTTP_HEADERS.IDEMPOTENCY_KEY] = headers[HTTP_HEADERS.IDEMPOTENCY_KEY]!;
    const retry = await json(origin, 'POST', '/v1/risk-events', retryHeaders, telecomBody);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(eventId);

    const modified = await json(origin, 'POST', '/v1/risk-events', headers, {
      ...telecomBody,
      callDurationSeconds: 1,
    });
    expect(modified.status).toBe(401);
    expect((modified.body.error as { code: string }).code).toBe('digest_mismatch');

    const replay = await json(origin, 'POST', '/v1/risk-events', headers, telecomBody);
    expect(replay.status).toBe(401);
    expect((replay.body.error as { code: string }).code).toBe('replay_detected');

    const conflictHeaders = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: Buffer.from(JSON.stringify({ ...telecomBody, callDurationSeconds: 12 }), 'utf8'),
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    conflictHeaders[HTTP_HEADERS.IDEMPOTENCY_KEY] = headers[HTTP_HEADERS.IDEMPOTENCY_KEY]!;
    const conflict = await json(origin, 'POST', '/v1/risk-events', conflictHeaders, {
      ...telecomBody,
      callDurationSeconds: 12,
    });
    expect(conflict.status).toBe(409);
    expect((conflict.body.error as { code: string }).code).toBe('idempotency_key_reused');

    const paymentBody = { subjectRef: SYNTHETIC_DEMO_SUBJECT_REF, paymentAmount: 100 };
    const bankHeaders = await signedHeaders({
      method: 'POST',
      path: '/v1/payment-intents',
      body: Buffer.from(JSON.stringify(paymentBody), 'utf8'),
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    const wrongScope = await json(origin, 'POST', '/v1/payment-intents', bankHeaders, paymentBody);
    expect(wrongScope.status).toBe(403);

    const otherOrg = await json(
      origin,
      'POST',
      `/v1/organizations/${bankId}/partner-connections`,
      { [HTTP_HEADERS.BOOTSTRAP_TOKEN]: BOOTSTRAP },
      {
        name: 'wrong kind',
        kind: PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
        environment: PARTNER_ENVIRONMENTS.SANDBOX,
        scopes: [PARTNER_SCOPES.RISK_EVENTS_WRITE],
        allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
      },
    );
    expect(otherOrg.status).toBe(403);

    const activity = await json(origin, 'GET', '/api/operations/api-activity?limit=50');
    expect(activity.status).toBe(200);
    expect((activity.body.items as unknown[]).length).toBeGreaterThan(0);
    const serialized = JSON.stringify(activity.body);
    expect(serialized).not.toContain(cred.clientSecret);
    expect(serialized).not.toContain(String(cred.signing.privateKeyJwk.d));
    expect(serialized).not.toMatch(/x-sentra-signature/i);

    const partners = await json(origin, 'GET', '/api/operations/partners');
    expect(partners.status).toBe(200);
    expect((partners.body.items as { signingKeys?: unknown }[])[0]?.signingKeys).toBeUndefined();
    expect(JSON.stringify(partners.body)).not.toContain('"d":');
  });

  it('rejects expired timestamps, concurrent nonce races, rate limits and revocation', async () => {
    const { origin, telecomId } = await boot({
      RATE_LIMIT_PARTNER_WRITE_MAX_REQUESTS: '2',
      RATE_LIMIT_PARTNER_ENDPOINT_MAX_REQUESTS: '2',
    });
    const cred = await createTelecom(origin, telecomId);
    const raw = Buffer.from(JSON.stringify(telecomBody), 'utf8');

    const past = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    expect(
      ((await json(origin, 'POST', '/v1/risk-events', past, telecomBody)).body.error as { code: string }).code,
    ).toBe('timestamp_invalid');

    const future = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
      timestamp: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    expect(
      ((await json(origin, 'POST', '/v1/risk-events', future, telecomBody)).body.error as { code: string }).code,
    ).toBe('timestamp_invalid');

    const raceNonce = `nonce_race_${Date.now()}abcdefgh`;
    const [left, right] = await Promise.all([
      signedHeaders({
        method: 'POST',
        path: '/v1/risk-events',
        body: raw,
        partnerId: cred.connection.id,
        keyId: cred.signing.kid,
        privateKeyJwk: cred.signing.privateKeyJwk,
        nonce: raceNonce,
      }),
      signedHeaders({
        method: 'POST',
        path: '/v1/risk-events',
        body: raw,
        partnerId: cred.connection.id,
        keyId: cred.signing.kid,
        privateKeyJwk: cred.signing.privateKeyJwk,
        nonce: raceNonce,
      }),
    ]);
    const raced = await Promise.all([
      json(origin, 'POST', '/v1/risk-events', left, telecomBody),
      json(origin, 'POST', '/v1/risk-events', right, telecomBody),
    ]);
    const codes = raced.map((res) => res.status).sort();
    expect(codes).toContain(200);
    expect(codes).toContain(401);

    const limited = [];
    for (let index = 0; index < 4; index += 1) {
      const headers = await signedHeaders({
        method: 'POST',
        path: '/v1/risk-events',
        body: raw,
        partnerId: cred.connection.id,
        keyId: cred.signing.kid,
        privateKeyJwk: cred.signing.privateKeyJwk,
      });
      limited.push(await json(origin, 'POST', '/v1/risk-events', headers, telecomBody));
    }
    expect(limited.some((res) => res.status === 429)).toBe(true);
    expect(limited.find((res) => res.status === 429)?.headers.get('retry-after')).toBeTruthy();

    await json(
      origin,
      'POST',
      `/v1/organizations/${telecomId}/partner-connections/${cred.connection.id}/signing-keys/${cred.signing.kid}/revoke`,
      { [HTTP_HEADERS.BOOTSTRAP_TOKEN]: BOOTSTRAP },
      {},
    );
    const afterRevoke = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    const revoked = await json(origin, 'POST', '/v1/risk-events', afterRevoke, telecomBody);
    expect((revoked.body.error as { code: string }).code).toBe('signature_invalid');
  });

  it('fails closed when Redis is unavailable', async () => {
    const { origin, telecomId } = await boot({
      REDIS_URL: 'redis://127.0.0.1:1',
      REDIS_CONNECT_TIMEOUT_MS: '200',
      REDIS_COMMAND_TIMEOUT_MS: '200',
      REDIS_MAX_RECONNECT_DELAY_MS: '200',
    });
    const cred = await createTelecom(origin, telecomId);
    const raw = Buffer.from(JSON.stringify(telecomBody), 'utf8');
    const headers = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    const res = await json(origin, 'POST', '/v1/risk-events', headers, telecomBody);
    expect(res.status).toBe(503);
    expect((res.body.error as { code: string }).code).toBe('dependency_unavailable');
  });

  it('rejects forbidden payload fields and production credential issuance', async () => {
    const { origin, telecomId } = await boot();
    const production = await json(
      origin,
      'POST',
      `/v1/organizations/${telecomId}/partner-connections`,
      { [HTTP_HEADERS.BOOTSTRAP_TOKEN]: BOOTSTRAP },
      {
        name: 'prod blocked',
        kind: PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
        environment: PARTNER_ENVIRONMENTS.PRODUCTION,
        scopes: [PARTNER_SCOPES.RISK_EVENTS_WRITE],
        allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
      },
    );
    expect(production.status).toBe(403);

    const unauth = await json(origin, 'POST', `/v1/organizations/${telecomId}/partner-connections`, {}, {
      name: 'no token',
      kind: PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
      scopes: [PARTNER_SCOPES.RISK_EVENTS_WRITE],
      allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
    });
    expect(unauth.status).toBe(403);

    const cred = await createTelecom(origin, telecomId);
    const forbiddenBody = { ...telecomBody, pan: '4111111111111111' };
    const raw = Buffer.from(JSON.stringify(forbiddenBody), 'utf8');
    const headers = await signedHeaders({
      method: 'POST',
      path: '/v1/risk-events',
      body: raw,
      partnerId: cred.connection.id,
      keyId: cred.signing.kid,
      privateKeyJwk: cred.signing.privateKeyJwk,
    });
    const forbidden = await json(origin, 'POST', '/v1/risk-events', headers, forbiddenBody);
    expect((forbidden.body.error as { code: string }).code).toBe('forbidden_field');
  });
});
