import { FLOW_STAGE_STATUSES, OPERATIONAL_EVENT_TYPES } from '@sentra/contracts';
import {
  createFakeAuditProvider,
  createFakeClock,
  createFakeIdGenerator,
  createFakeUnitOfWork,
} from '@sentra/testing';
import { describe, expect, it } from 'vitest';
import { createEvaluatePaymentRiskUseCase } from '../evaluate-payment-risk';
import { SIMULATOR_SCENARIOS } from '../scenarios';

const buildUseCase = () => {
  const clock = createFakeClock();
  const ids = createFakeIdGenerator();
  const unitOfWork = createFakeUnitOfWork(clock);
  const audit = createFakeAuditProvider({ unitOfWork });
  const useCase = createEvaluatePaymentRiskUseCase({ clock, ids, audit, unitOfWork });
  return { useCase, audit };
};

const appScam = SIMULATOR_SCENARIOS.find((s) => s.id === 'app-impersonation-scam')!.input;

describe('createEvaluatePaymentRiskUseCase', () => {
  it('produces an explainable recommendation carrying the correlation id', async () => {
    const { useCase } = buildUseCase();

    const output = await useCase.execute(appScam, {
      correlationId: 'crl_test_evaluate_one',
      actorLabel: 'partner:bank-sandbox',
    });

    expect(output.recommendation.correlationId).toBe('crl_test_evaluate_one');
    expect(output.recommendation.synthetic).toBe(true);
    expect(output.recommendation.modelVersion).toBeNull();
    expect(output.recommendation.authorityNote).toContain('bank retains final authority');
    expect(output.recommendation.reasonCodes.length).toBeGreaterThan(0);
    expect(output.recommendation.policyVersion).toMatch(/^policy-/);
  });

  it('records a hash-linked audit chain committed with the transaction', async () => {
    const { useCase, audit } = buildUseCase();

    const output = await useCase.execute(appScam, { correlationId: 'crl_test_evaluate_two' });

    expect(output.recommendation.auditEvents.length).toBeGreaterThanOrEqual(4);
    // The chain is committed (the fake exposes committed events only after the uow resolves).
    expect(audit.events().length).toBe(output.recommendation.auditEvents.length);

    const sequences = output.recommendation.auditEvents.map((e) => Number(e.sequence));
    const ascending = [...sequences].sort((a, b) => a - b);
    expect(sequences).toEqual(ascending);

    // Each link points at the previous link's self hash.
    for (let i = 1; i < output.recommendation.auditEvents.length; i += 1) {
      expect(output.recommendation.auditEvents[i]!.hashPrev).toBe(
        output.recommendation.auditEvents[i - 1]!.hashSelf,
      );
    }
  });

  it('emits the operational events the live stream renders', async () => {
    const { useCase } = buildUseCase();
    const output = await useCase.execute(appScam, { correlationId: 'crl_test_evaluate_three' });

    const types = output.events.map((e) => e.type);
    expect(types).toContain(OPERATIONAL_EVENT_TYPES.PAYMENT_INTENT);
    expect(types).toContain(OPERATIONAL_EVENT_TYPES.RISK_ASSESSMENT);
    expect(types).toContain(OPERATIONAL_EVENT_TYPES.DECISION_RECOMMENDATION);
    for (const event of output.events) {
      expect(event.correlationId).toBe('crl_test_evaluate_three');
      expect(event.synthetic).toBe(true);
    }
  });

  it('builds an eleven-stage flow with pending downstream stages', async () => {
    const { useCase } = buildUseCase();
    const output = await useCase.execute(appScam, { correlationId: 'crl_test_evaluate_four' });

    expect(output.flow.stages).toHaveLength(11);
    const recommendation = output.flow.stages.find((s) => s.stage === 'RECOMMENDATION');
    expect(recommendation?.status).toBe(FLOW_STAGE_STATUSES.COMPLETED);
    const bankDecision = output.flow.stages.find((s) => s.stage === 'BANK_DECISION');
    expect(bankDecision?.status).toBe(FLOW_STAGE_STATUSES.PENDING);
    for (const stage of output.flow.stages) {
      expect(stage.correlationId).toBe('crl_test_evaluate_four');
    }
  });
});
