import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './test-app';

describe('partner operations in-memory mode', () => {
  it('returns empty API activity and partner lists without error', async () => {
    const { app } = await buildTestApp();

    const activity = await request(app).get('/api/operations/api-activity');
    expect(activity.status).toBe(200);
    expect(activity.body.items).toEqual([]);
    expect(activity.body.degraded).toBe(true);

    const partners = await request(app).get('/api/operations/partners');
    expect(partners.status).toBe(200);
    expect(partners.body.items).toEqual([]);
    expect(partners.body.degraded).toBe(true);
  });

  it('refuses sandbox generation and partner credential writes', async () => {
    const { app } = await buildTestApp();

    const sandbox = await request(app)
      .post('/api/operations/sandbox/signed-request')
      .send({ kind: 'TELECOM_EVENTS' });
    expect(sandbox.status).toBe(403);

    const ingest = await request(app).post('/v1/risk-events').send({ subjectRef: 'subj_test_aaaaaaaaaaaaaaaaaaaa' });
    expect(ingest.status).toBe(503);
  });
});
