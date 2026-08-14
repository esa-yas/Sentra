import { describe, expect, it } from 'vitest';
import {
  RISK_INDICATOR_CODES,
  RISK_SIGNAL_STATUSES,
  type RiskIndicator,
  type RiskSignalProvider,
} from '@sentra/ports';

export interface RiskSignalProviderContractHarness {
  readonly riskSignals: RiskSignalProvider;
  readonly grantConsent: (subjectRef: string) => void;
  readonly setIndicators: (subjectRef: string, indicators: readonly RiskIndicator[]) => void;
  readonly markUnavailable: (reason?: string) => void;
}

export const describeRiskSignalProviderContract = (
  name: string,
  factory: () => RiskSignalProviderContractHarness,
): void => {
  describe(`${name} RiskSignalProvider`, () => {
    const baseQuery = {
      subjectRef: 'pairwise_subject_ref_contract_test_001',
      organizationId: '01ORG_BANK',
      lookbackSeconds: 300,
      timeoutMs: 250,
      correlationId: 'crl_risk_contract',
    };

    it('returns OK with an empty indicator list when consent exists but no signals match', async () => {
      const harness = factory();
      harness.grantConsent(baseQuery.subjectRef);

      const result = await harness.riskSignals.query(baseQuery);

      expect(result.status).toBe(RISK_SIGNAL_STATUSES.OK);
      if (result.status === RISK_SIGNAL_STATUSES.OK) {
        expect(result.indicators).toEqual([]);
      }
    });

    it('returns NO_CONSENT without attempting a lookup when consent is absent', async () => {
      const harness = factory();

      const result = await harness.riskSignals.query(baseQuery);

      expect(result.status).toBe(RISK_SIGNAL_STATUSES.NO_CONSENT);
      if (result.status !== RISK_SIGNAL_STATUSES.OK) {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });

    it('returns UNAVAILABLE when the upstream cannot answer', async () => {
      const harness = factory();
      harness.grantConsent(baseQuery.subjectRef);
      harness.markUnavailable('telecom feed timed out');

      const result = await harness.riskSignals.query(baseQuery);

      expect(result.status).toBe(RISK_SIGNAL_STATUSES.UNAVAILABLE);
      if (result.status !== RISK_SIGNAL_STATUSES.OK) {
        expect(result.reason).toContain('timed out');
      }
    });

    it('never throws when the upstream fails', async () => {
      const harness = factory();
      harness.markUnavailable();

      await expect(harness.riskSignals.query(baseQuery)).resolves.toMatchObject({
        status: RISK_SIGNAL_STATUSES.UNAVAILABLE,
      });
    });

    it('returns matched indicators inside the lookback window', async () => {
      const harness = factory();
      harness.grantConsent(baseQuery.subjectRef);
      harness.setIndicators(baseQuery.subjectRef, [
        {
          code: RISK_INDICATOR_CODES.ACTIVE_CALL_DURING_PAYMENT,
          confidence: 0.91,
          observedAt: new Date(),
          sourceOrganizationId: '01ORG_TELCO',
          consentId: '01CONSENT_1',
        },
      ]);

      const result = await harness.riskSignals.query(baseQuery);

      expect(result.status).toBe(RISK_SIGNAL_STATUSES.OK);
      if (result.status === RISK_SIGNAL_STATUSES.OK) {
        expect(result.indicators).toHaveLength(1);
      }
    });
  });
};
