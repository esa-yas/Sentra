import { SYNTHETIC_BANK_SLUG, SYNTHETIC_DEMO_SUBJECT_REF, SYNTHETIC_TELECOM_SLUG } from '@sentra/core';
import { createNullLogger } from '@sentra/observability';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import { buildContainer } from '../../apps/api/src/container';
import { loadConfig } from '@sentra/config';
import { createOrganization, prisma } from './setup';
import { createServer, type Server } from 'node:http';
import type { RequestListener } from 'node:http';

const testUrl = process.env.TEST_DATABASE_URL as string;

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

describe('API real provider mode', () => {
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
  });

  it('evaluates, persists, and remains visible after a new container is built', async () => {
    const organizationId = await createOrganization('BANK');
    const telecomId = await createOrganization('TELECOM');
    await prisma.organization.update({
      where: { id: organizationId },
      data: { slug: SYNTHETIC_BANK_SLUG },
    });
    await prisma.organization.update({
      where: { id: telecomId },
      data: { slug: SYNTHETIC_TELECOM_SLUG },
    });
    await prisma.consentRecord.create({
      data: {
        id: `con_${organizationId.slice(0, 16)}`,
        organizationId,
        subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
        purpose: 'PROTECT_PAYMENT',
        scope: 'telecom-risk-signals:payment-protection',
        source: 'test',
        status: 'GRANTED',
      },
    });

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      DATABASE_DIRECT_URL: testUrl,
      REDIS_URL: 'redis://localhost:6379',
      SENTRA_PROVIDER_MODE: 'real',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    });

    const first = await buildContainer(config, createNullLogger());
    disconnect = first.disconnect;
    const bound = await listen(createApp(first));
    server = bound.server;

    const cid = 'crl_real_persist_01';
    const evaluated = await fetch(`${bound.origin}/api/simulator/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': cid },
      body: JSON.stringify({
        paymentAmount: 8_400,
        currency: 'GBP',
        firstTimePayee: true,
        telecomEvidence: 'OK',
        recentSuspiciousCall: true,
        callerReputation: 'KNOWN_BAD',
        callDurationSeconds: 900,
        scamCampaignMatch: true,
      }),
    });
    expect(evaluated.status).toBe(200);
    expect(evaluated.headers.get('x-correlation-id')).toBe(cid);
    const evaluatedBody = (await evaluated.json()) as {
      recommendation: { correlationId: string; decisionId: string };
    };
    expect(evaluatedBody.recommendation.correlationId).toBe(cid);
    const decisionId = evaluatedBody.recommendation.decisionId;

    const cases = await fetch(`${bound.origin}/api/cases`);
    const casesBody = (await cases.json()) as { items: { decisionId: string }[] };
    expect(casesBody.items.some((item) => item.decisionId === decisionId)).toBe(true);

    await close(bound.server);
    server = undefined;
    await first.disconnect();
    disconnect = undefined;

    const second = await buildContainer(config, createNullLogger());
    disconnect = second.disconnect;
    const bound2 = await listen(createApp(second));
    server = bound2.server;
    const again = await fetch(`${bound2.origin}/api/cases/${decisionId}`);
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { recommendation: { correlationId: string } };
    expect(againBody.recommendation.correlationId).toBe(cid);

    const ready = await fetch(`${bound2.origin}/ready`);
    expect(ready.status).toBe(200);
    const readyBody = (await ready.json()) as { dependencies: { name: string }[] };
    expect(readyBody.dependencies.some((item) => item.name === 'postgresql')).toBe(true);
  });
});
