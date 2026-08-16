import { createHash } from 'node:crypto';
import {
  CONTENT_DIGEST_PREFIX,
  PARTNER_CONNECTION_KINDS,
  PARTNER_ENVIRONMENTS,
  PARTNER_SCOPES,
  PARTNER_SIGNING_HEADERS,
  PURPOSES,
  SIGNING_ALGORITHMS,
} from '@sentra/contracts';
import { createJwsSignatureVerifier, generateEs256KeyPair, signCanonicalRequest } from '@sentra/adapters';
import { loadConfig } from '@sentra/config';
import type {
  CacheLease,
  CacheProvider,
  PartnerApiActivityStore,
  PartnerConnectionRecord,
  PartnerConnectionRepository,
  PartnerDirectoryReadModel,
  PartnerSigningKeyRecord,
  PartnerSigningKeyRepository,
} from '@sentra/ports';
import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { createPartnerAuthenticator, emptySecurityOutcome } from '../partner/authenticator';

const organizationId = '01ORGTELECOM00000000000001';
const connectionId = '01CONNTELECOM0000000000001';

class MemoryCache implements CacheProvider {
  public unavailable = false;
  private readonly leases = new Set<string>();

  public async get(): Promise<null> {
    return null;
  }
  public async set(): Promise<void> {
    return undefined;
  }
  public async delete(): Promise<void> {
    return undefined;
  }
  public async deleteByPrefix(): Promise<number> {
    return 0;
  }
  public async increment(): Promise<{ count: number; ttlSeconds: number }> {
    this.assertAvailable();
    return { count: 1, ttlSeconds: 60 };
  }
  public async acquireLease(key: string): Promise<CacheLease | null> {
    this.assertAvailable();
    if (this.leases.has(key)) {
      return null;
    }
    this.leases.add(key);
    return {
      key,
      token: 't',
      release: async () => {
        this.leases.delete(key);
      },
      renew: async () => true,
    };
  }
  public async ping(): Promise<boolean> {
    return !this.unavailable;
  }
  public async close(): Promise<void> {
    return undefined;
  }
  private assertAvailable(): void {
    if (this.unavailable) {
      throw new Error('cache unavailable');
    }
  }
}

describe('PartnerAuthenticator', () => {
  it('accepts the first nonce and rejects reuse, skew, and cache outage', async () => {
    const pair = await generateEs256KeyPair();
    const kid = 'kid_test_auth_1';
    const now = new Date('2026-08-15T12:00:00.000Z');
    const key: PartnerSigningKeyRecord = {
      id: 'key_1',
      partnerConnectionId: connectionId,
      organizationId,
      kid,
      algorithm: SIGNING_ALGORITHMS.ES256,
      publicKeyJwk: pair.publicKeyJwk as Record<string, unknown>,
      status: 'ACTIVE',
      notBefore: new Date('2020-01-01T00:00:00.000Z'),
      notAfter: null,
      createdAt: now,
      revokedAt: null,
      lastUsedAt: null,
    };
    const cache = new MemoryCache();
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://sentra:sentra@localhost:5432/sentra_test?schema=public',
      DATABASE_DIRECT_URL: 'postgresql://sentra:sentra@localhost:5432/sentra_test?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    });
    const connection: PartnerConnectionRecord = {
      id: connectionId,
      organizationId,
      name: 'telecom sandbox',
      kind: PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
      environment: PARTNER_ENVIRONMENTS.SANDBOX,
      clientId: 'pc_test',
      scopes: [PARTNER_SCOPES.RISK_EVENTS_WRITE],
      allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
      ipAllowlist: [],
      tokenTtlSeconds: 300,
      status: 'ACTIVE',
      lastRotatedAt: null,
      lastUsedAt: null,
      rotationDueAt: null,
      createdAt: now,
      createdBy: 'test',
    };
    const clock = { now: () => now, monotonicMs: () => 0 };
    const authenticator = createPartnerAuthenticator({
      config,
      clock,
      ids: { generate: () => 'id_1', generateAt: () => 'id_1' },
      cache,
      connections: {
        findByIdUnscoped: async () => connection,
        touchLastUsed: async () => undefined,
      } as unknown as PartnerConnectionRepository,
      keys: { findByOrganizationAndKid: async () => key } as unknown as PartnerSigningKeyRepository,
      signatures: createJwsSignatureVerifier({
        keys: { findByOrganizationAndKid: async () => key } as unknown as PartnerSigningKeyRepository,
        clock,
        allowedAlgorithms: ['ES256'],
        timestampSkewSeconds: 30,
        replayWindowSeconds: 300,
      }),
      directory: {
        organizationById: async () => ({
          id: organizationId,
          slug: 'telco-sandbox',
          type: 'TELECOM',
          status: 'ACTIVE',
        }),
        listConnections: async () => ({ items: [] }),
        organizationLabels: async () => new Map(),
        listOrganizationsByType: async () => [],
      } as PartnerDirectoryReadModel,
      activity: {
        record: async () => undefined,
        list: async () => ({ items: [] }),
        recentFailureCount: async () => 0,
      } as PartnerApiActivityStore,
    });

    const sign = async (nonce: string, timestamp = now.toISOString()) => {
      const raw = Buffer.from('{"ok":true}', 'utf8');
      const digest = `${CONTENT_DIGEST_PREFIX}${createHash('sha256').update(raw).digest('base64url')}`;
      const signature = await signCanonicalRequest({
        canonical: {
          method: 'POST',
          path: '/v1/risk-events',
          timestamp,
          nonce,
          contentDigest: digest,
          partnerConnectionId: connectionId,
          keyId: kid,
        },
        privateKeyJwk: pair.privateKeyJwk,
        algorithm: SIGNING_ALGORITHMS.ES256,
      });
      const headers: Record<string, string> = {
        [PARTNER_SIGNING_HEADERS.TIMESTAMP]: timestamp,
        [PARTNER_SIGNING_HEADERS.NONCE]: nonce,
        [PARTNER_SIGNING_HEADERS.PARTNER_ID]: connectionId,
        [PARTNER_SIGNING_HEADERS.KEY_ID]: kid,
        [PARTNER_SIGNING_HEADERS.CONTENT_DIGEST]: digest,
        [PARTNER_SIGNING_HEADERS.SIGNATURE]: signature,
      };
      return {
        method: 'POST',
        path: '/v1/risk-events',
        originalUrl: '/v1/risk-events',
        body: { ok: true },
        rawBody: raw,
        header: (name: string) => headers[name.toLowerCase()],
      } as unknown as Request;
    };

    expect((await authenticator.authenticate(await sign('nonce_first_request'), emptySecurityOutcome())).connection.id).toBe(
      connectionId,
    );
    await expect(
      authenticator.authenticate(await sign('nonce_first_request'), emptySecurityOutcome()),
    ).rejects.toMatchObject({ code: 'replay_detected' });
    await expect(
      authenticator.authenticate(
        await sign('nonce_past_request_01', new Date(now.getTime() - 10 * 60_000).toISOString()),
        emptySecurityOutcome(),
      ),
    ).rejects.toMatchObject({ code: 'timestamp_invalid' });
    await expect(
      authenticator.authenticate(
        await sign('nonce_future_request1', new Date(now.getTime() + 10 * 60_000).toISOString()),
        emptySecurityOutcome(),
      ),
    ).rejects.toMatchObject({ code: 'timestamp_invalid' });

    cache.unavailable = true;
    await expect(
      authenticator.authenticate(await sign('nonce_when_redis_down'), emptySecurityOutcome()),
    ).rejects.toMatchObject({ code: 'dependency_unavailable' });
  });
});
