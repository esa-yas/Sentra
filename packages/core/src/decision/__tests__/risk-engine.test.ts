import {
  DECISION_REASON_CODES,
  RECOMMENDATION_ACTIONS,
  RISK_LEVELS,
  type RecommendationAction,
  type SimulatorEvaluateRequest,
} from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import { evaluateScamRisk } from '../risk-engine';
import { SIMULATOR_SCENARIOS } from '../scenarios';

const scenario = (id: string): SimulatorEvaluateRequest => {
  const found = SIMULATOR_SCENARIOS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`Unknown scenario ${id}`);
  }
  return found.input;
};

/** Every action the engine can return is advisory; there is no autonomous block. */
const ADVISORY_ACTIONS: readonly RecommendationAction[] = Object.values(RECOMMENDATION_ACTIONS);

describe('evaluateScamRisk', () => {
  it('scores the APP impersonation scenario as critical and explains itself', () => {
    const result = evaluateScamRisk(scenario('app-impersonation-scam'));

    expect(result.riskLevel).toBe(RISK_LEVELS.CRITICAL);
    expect(result.riskScore).toBeGreaterThanOrEqual(75);
    expect(result.reasonCodes).toContain(DECISION_REASON_CODES.SCAM_CAMPAIGN_MATCH);
    expect(result.reasonCodes).toContain(DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL);
    expect(result.contributingSignals.length).toBeGreaterThan(0);
    // Contributing signals are ordered by contribution, descending.
    const contributions = result.contributingSignals.map((s) => s.contribution);
    expect([...contributions].sort((a, b) => b - a)).toEqual(contributions);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('scores a routine safe payment as low with no intervention', () => {
    const result = evaluateScamRisk(scenario('routine-safe-payment'));

    expect(result.riskLevel).toBe(RISK_LEVELS.LOW);
    expect(result.recommendedAction).toBe(RECOMMENDATION_ACTIONS.ALLOW);
    expect(result.reasonCodes).toHaveLength(0);
    expect(result.uncertainty).toBeLessThan(0.2);
  });

  it('floors account-takeover cases at high or above', () => {
    const result = evaluateScamRisk(scenario('account-takeover'));

    expect([RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL]).toContain(result.riskLevel);
    expect(result.reasonCodes).toContain(DECISION_REASON_CODES.ACCOUNT_TAKEOVER_SIGNALS);
    expect(result.reasonCodes).toContain(DECISION_REASON_CODES.IDENTITY_VERIFICATION_FAILED);
  });

  it('fails neutral when the telecom feed is unavailable', () => {
    const result = evaluateScamRisk(scenario('telecom-unavailable'));

    // Missing evidence must not read as "no risk": a high-value first-time payee escalates.
    expect(result.riskLevel).not.toBe(RISK_LEVELS.LOW);
    expect(result.missingProviders).toContain('telecom-risk-signals');
    expect(result.uncertainty).toBeGreaterThanOrEqual(0.3);
    expect(result.rulesTriggered).toContain('R-MISSING-EVIDENCE-ESCALATION');
  });

  it('does not use telecom booleans when the feed is unavailable', () => {
    const base = scenario('telecom-unavailable');
    const withPhantomCall: SimulatorEvaluateRequest = {
      ...base,
      recentSuspiciousCall: true,
      callDurationSeconds: 600,
    };

    const result = evaluateScamRisk(withPhantomCall);
    expect(result.reasonCodes).not.toContain(DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL);
    expect(result.reasonCodes).not.toContain(DECISION_REASON_CODES.PROLONGED_CALL_BEFORE_PAYMENT);
  });

  it('is deterministic for identical inputs', () => {
    const input = scenario('app-impersonation-scam');
    expect(evaluateScamRisk(input)).toEqual(evaluateScamRisk(input));
  });

  it('only ever recommends advisory actions', () => {
    for (const preset of SIMULATOR_SCENARIOS) {
      const result = evaluateScamRisk(preset.input);
      expect(ADVISORY_ACTIONS).toContain(result.recommendedAction);
    }
  });

  it('caps the score at 100 even when every signal fires', () => {
    const everything: SimulatorEvaluateRequest = {
      currency: 'GBP',
      paymentAmount: 50_000,
      payeeAgeDays: 0,
      firstTimePayee: true,
      paymentVelocity24h: 10,
      telecomEvidence: 'OK',
      recentSuspiciousCall: true,
      callerReputation: 'KNOWN_BAD',
      callDurationSeconds: 1_200,
      deviceChange: true,
      accountTakeoverIndicators: true,
      scamCampaignMatch: true,
      customerVulnerability: true,
      identityVerificationResult: 'FAIL',
      previousWarnings: 5,
    };

    const result = evaluateScamRisk(everything);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskScore).toBeGreaterThanOrEqual(90);
    expect(result.riskLevel).toBe(RISK_LEVELS.CRITICAL);
  });
});
