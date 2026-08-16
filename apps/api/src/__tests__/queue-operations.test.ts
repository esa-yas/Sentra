import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './test-app';

/**
 * Queue Monitor API behaviour in the in-memory provider mode. Durable delivery is not wired
 * here, so the endpoints must degrade cleanly — valid shapes, NOT_CONFIGURED health, empty
 * lists — and every mutating development action must be refused.
 */
describe('queue operations API (durable delivery not configured)', () => {
  it('returns a NOT_CONFIGURED monitor summary with empty queues', async () => {
    const { app } = await buildTestApp();

    const res = await request(app).get('/api/operations/queues');
    expect(res.status).toBe(200);
    expect(res.body.redis.state).toBe('NOT_CONFIGURED');
    expect(res.body.worker.state).toBe('NOT_CONFIGURED');
    expect(res.body.publisher.state).toBe('NOT_CONFIGURED');
    expect(res.body.outbox.pending).toBe(0);
    expect(res.body.queues).toEqual([]);
  });

  it('reports Redis, BullMQ, worker, and publisher rows on integrations', async () => {
    const { app } = await buildTestApp();

    const res = await request(app).get('/api/operations/integrations');
    expect(res.status).toBe(200);
    const names = (res.body.items as { name: string; state: string }[]).map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['Redis', 'BullMQ', 'Worker', 'Outbox publisher']));
  });

  it('returns an empty, paginated outbox list', async () => {
    const { app } = await buildTestApp();

    const res = await request(app).get('/api/operations/outbox?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeUndefined();
  });

  it('rejects an out-of-range page size', async () => {
    const { app } = await buildTestApp();

    const res = await request(app).get('/api/operations/outbox?limit=9999');
    expect(res.status).toBe(422);
  });

  it('returns empty jobs for a known queue and refuses an unknown one', async () => {
    const { app } = await buildTestApp();

    const known = await request(app).get('/api/operations/queues/recommendation-events/jobs');
    expect(known.status).toBe(200);
    expect(known.body.items).toEqual([]);
  });

  it('refuses development actions when durable delivery is not configured', async () => {
    const { app } = await buildTestApp();

    const retry = await request(app).post('/api/operations/queues/recommendation-events/jobs/job_1/retry');
    expect(retry.status).toBe(403);

    const replay = await request(app).post('/api/operations/outbox/evt_1/replay');
    expect(replay.status).toBe(403);

    const duplicate = await request(app).post('/api/operations/outbox/evt_1/duplicate');
    expect(duplicate.status).toBe(403);
  });
});
