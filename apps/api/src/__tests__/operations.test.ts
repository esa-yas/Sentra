import { simulatorEvaluateRequestSchema } from '@sentra/contracts';
import { generateCorrelationId } from '@sentra/observability';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Container } from '../container';
import { buildTestApp } from './test-app';

const APP_SCAM_BODY = {
  paymentAmount: 8_400,
  currency: 'GBP',
  firstTimePayee: true,
  telecomEvidence: 'OK',
  recentSuspiciousCall: true,
  callerReputation: 'KNOWN_BAD',
  callDurationSeconds: 900,
  scamCampaignMatch: true,
};

/**
 * Seeds one evaluation directly through the core decision engine — the same path the real
 * partner-ingest route uses — so the operations read models have data to reflect. (The demo
 * simulator HTTP route was removed; the engine it wrapped is unchanged.)
 */
const seedEvaluation = async (container: Container): Promise<void> => {
  const input = simulatorEvaluateRequestSchema.parse(APP_SCAM_BODY);
  const output = await container.evaluate.execute(input, {
    correlationId: generateCorrelationId(),
    actorLabel: 'test:seed',
    organizationId: container.syntheticOrganizationId,
    subjectRef: container.syntheticSubjectRef,
  });
  container.store.recordEvaluation(output);
};

describe('operations read models', () => {
  it('summary starts empty and reflects an evaluation', async () => {
    const { app, container } = await buildTestApp();

    const before = await request(app).get('/api/operations/summary');
    expect(before.status).toBe(200);
    expect(before.body.providerMode).toBe('in-memory');
    expect(before.body.volume.paymentIntentsReceived).toBe(0);
    expect(before.body.caseSeverity.critical).toBe(0);

    await seedEvaluation(container);

    const after = await request(app).get('/api/operations/summary');
    expect(after.body.volume.paymentIntentsReceived).toBe(1);
    expect(after.body.caseSeverity.critical).toBe(1);
    expect(after.body.volume.riskEventsReceived).toBe(1);
    // Outcome counters are explicitly labelled synthetic.
    expect(after.body.outcomes.origin).toBe('SYNTHETIC');
    expect(after.body.volume.origin).toBe('MEASURED');
  });

  it('lists events with a redacted payload preview and supports the id lookup', async () => {
    const { app, container } = await buildTestApp();
    await seedEvaluation(container);

    const list = await request(app).get('/api/events');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);

    const event = list.body.items[0];
    expect(event).toHaveProperty('correlationId');
    expect(event).toHaveProperty('payloadPreview');
    // No forbidden or secret-looking fields ever appear in a preview.
    const serialized = JSON.stringify(event.payloadPreview);
    expect(serialized).not.toMatch(/4111111111111111/);

    const byId = await request(app).get(`/api/events/${event.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(event.id);
  });

  it('filters events by type', async () => {
    const { app, container } = await buildTestApp();
    await seedEvaluation(container);

    const filtered = await request(app)
      .get('/api/events')
      .query({ type: 'decision.recommendation.issued' });

    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThan(0);
    for (const event of filtered.body.items) {
      expect(event.type).toBe('decision.recommendation.issued');
    }
  });

  it('serves the latest flow and the development status', async () => {
    const { app, container } = await buildTestApp();

    const emptyFlow = await request(app).get('/api/operations/flow/latest');
    expect(emptyFlow.status).toBe(200);
    expect(emptyFlow.body.stages).toHaveLength(11);

    await seedEvaluation(container);

    const flow = await request(app).get('/api/operations/flow/latest');
    expect(flow.body.stages.find((s: { stage: string }) => s.stage === 'RECOMMENDATION').status).toBe(
      'COMPLETED',
    );

    const dev = await request(app).get('/api/operations/development-status');
    expect(dev.status).toBe(200);
    expect(dev.body.providerMode).toBe('in-memory');
    expect(dev.body.capabilities.length).toBeGreaterThan(0);
    // Never a hardcoded "all tests pass" claim.
    expect(dev.body.verification.unitTests).toBeNull();
  });

  it('returns 404 for an unknown event', async () => {
    const { app } = await buildTestApp();
    const response = await request(app).get('/api/events/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
