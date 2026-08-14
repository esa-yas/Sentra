import { ERROR_CODES, HTTP_HEADERS } from '@sentra/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './test-app';

const APP_SCAM_BODY = {
  paymentAmount: 8_400,
  currency: 'GBP',
  firstTimePayee: true,
  payeeAgeDays: 0,
  telecomEvidence: 'OK',
  recentSuspiciousCall: true,
  callerReputation: 'KNOWN_BAD',
  callDurationSeconds: 900,
  scamCampaignMatch: true,
  identityVerificationResult: 'PASS',
};

describe('POST /api/simulator/evaluate', () => {
  it('returns an explainable, advisory recommendation', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/simulator/evaluate').send(APP_SCAM_BODY);

    expect(response.status).toBe(200);
    const { recommendation, flow } = response.body;
    expect(recommendation.riskLevel).toBe('CRITICAL');
    expect(recommendation.reasonCodes.length).toBeGreaterThan(0);
    expect(recommendation.contributingSignals.length).toBeGreaterThan(0);
    expect(recommendation.policyVersion).toMatch(/^policy-/);
    expect(recommendation.authorityNote).toContain('bank retains final authority');
    expect(recommendation.synthetic).toBe(true);
    expect(recommendation.auditEvents.length).toBeGreaterThanOrEqual(4);
    expect(flow.stages).toHaveLength(11);
  });

  it('echoes the same correlation id in the header and the body', async () => {
    const { app } = buildTestApp();
    const supplied = 'crl_supertest_fixed_one';

    const response = await request(app)
      .post('/api/simulator/evaluate')
      .set(HTTP_HEADERS.CORRELATION_ID, supplied)
      .send(APP_SCAM_BODY);

    expect(response.headers[HTTP_HEADERS.CORRELATION_ID]).toBe(supplied);
    expect(response.body.recommendation.correlationId).toBe(supplied);
    expect(response.body.flow.correlationId).toBe(supplied);
  });

  it('rejects a payload carrying a forbidden field', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/simulator/evaluate')
      .send({ ...APP_SCAM_BODY, pan: '4111111111111111' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN_FIELD);
  });

  it('rejects an invalid payload with a validation error', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/simulator/evaluate')
      .send({ paymentAmount: -5, callerReputation: 'NONSENSE' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(Array.isArray(response.body.error.details.problems)).toBe(true);
  });

  it('exposes preset synthetic scenarios', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/simulator/scenarios');
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toHaveProperty('input');
  });
});
