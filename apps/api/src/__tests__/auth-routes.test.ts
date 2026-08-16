import { InvalidTokenError } from '@sentra/contracts';
import { createNullLogger } from '@sentra/observability';
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Container } from '../container';
import { errorHandler, notFoundHandler } from '../middleware/error-handler';
import { createAuthRouter } from '../routes/auth';

const sessionFixture = {
  principal: {
    id: 'user-1',
    kind: 'USER' as const,
    actorType: 'USER' as const,
    label: 'user:user-1',
    issuer: 'https://project.supabase.co/auth/v1',
    subject: 'sub-1',
    memberships: [
      {
        organizationId: 'org-1',
        organizationSlug: 'acme-bank',
        organizationType: 'BANK' as const,
        role: 'ADMIN' as const,
        permissions: ['organization:read' as const],
        purposes: ['SERVICE_OPERATION' as const],
      },
    ],
  },
  profile: { userId: 'user-1', email: 'ops@bank.test', displayName: 'ops' },
  provisioned: false,
};

const buildApp = (options: { enabled: boolean }): Express => {
  const auth = options.enabled
    ? {
        resolve: {
          execute: async (token: string) => {
            if (token !== 'good') {
              throw new InvalidTokenError();
            }
            return sessionFixture;
          },
        },
      }
    : undefined;

  const container = {
    providerMode: 'real',
    logger: createNullLogger(),
    ...(auth === undefined ? {} : { auth }),
  } as unknown as Container;

  const app = express();
  app.use(express.json());
  app.use('/api', createAuthRouter(container));
  app.use(notFoundHandler());
  app.use(errorHandler(createNullLogger()));
  return app;
};

describe('auth routes', () => {
  it('advertises that authentication is enabled', async () => {
    const res = await request(buildApp({ enabled: true })).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, providerMode: 'real' });
  });

  it('advertises that authentication is disabled when unwired', async () => {
    const res = await request(buildApp({ enabled: false })).get('/api/auth/config');
    expect(res.body.enabled).toBe(false);
  });

  it('returns the resolved user and memberships for a valid bearer token', async () => {
    const res = await request(buildApp({ enabled: true }))
      .get('/api/auth/me')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'user-1', email: 'ops@bank.test', displayName: 'ops' });
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].role).toBe('ADMIN');
  });

  it('rejects a missing Authorization header with 401', async () => {
    const res = await request(buildApp({ enabled: true })).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token with 401', async () => {
    const res = await request(buildApp({ enabled: true }))
      .get('/api/auth/me')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });

  it('returns 401 for /me when authentication is not configured', async () => {
    const res = await request(buildApp({ enabled: false }))
      .get('/api/auth/me')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(401);
  });

  it('accepts logout without a token and reports success', async () => {
    const res = await request(buildApp({ enabled: true })).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
