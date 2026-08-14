import {
  CALLER_REPUTATIONS,
  DECISION_REASON_CODES,
  EVIDENCE_AVAILABILITY,
  IDENTITY_VERIFICATION_RESULTS,
  RECOMMENDATION_ACTIONS,
  type ContributingSignal,
  type DecisionReasonCode,
  type EvidenceSourceState,
  type RecommendationAction,
  type RiskLevel,
  type SimulatorEvaluateRequest,
} from '@sentra/contracts';
import { REASON_CODE_DEFINITIONS } from './reason-codes';
import { POLICY_VERSION, RULES_VERSION, levelForScore, maxLevel, selectAction } from './policy';

/**
 * Deterministic, explainable scam-risk scorer (slides 067–069).
 *
 * The function is pure: the same input always yields the same output, which is what makes
 * the fixture tests meaningful and a decision reproducible. It never treats missing
 * evidence as absence of risk — an unavailable source raises uncertainty and can escalate
 * a borderline recommendation, but never lowers the score (slide 035).
 *
 * It returns no identifiers or timestamps; the use case adds correlation, decision id, and
 * audit provenance around this result.
 */
export interface RiskAssessment {
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly uncertainty: number;
  readonly recommendedAction: RecommendationAction;
  readonly alternativeActions: readonly RecommendationAction[];
  readonly reasonCodes: readonly DecisionReasonCode[];
  readonly contributingSignals: readonly ContributingSignal[];
  readonly rulesTriggered: readonly string[];
  readonly evidenceSources: readonly EvidenceSourceState[];
  readonly missingProviders: readonly string[];
  readonly policyVersion: string;
  readonly rulesVersion: string;
  readonly summary: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Whether telecom-derived booleans may be trusted for this evaluation. */
const telecomUsable = (input: SimulatorEvaluateRequest): boolean =>
  input.telecomEvidence === EVIDENCE_AVAILABILITY.OK ||
  input.telecomEvidence === EVIDENCE_AVAILABILITY.OK_NO_SIGNALS;

const buildContribution = (
  code: DecisionReasonCode,
  contribution: number,
): ContributingSignal => {
  const definition = REASON_CODE_DEFINITIONS[code];
  return {
    code,
    title: definition.title,
    description: definition.description,
    contribution: Math.min(contribution, definition.maxWeight),
    category: definition.category,
  };
};

export const evaluateScamRisk = (input: SimulatorEvaluateRequest): RiskAssessment => {
  const signals: ContributingSignal[] = [];
  const rules: string[] = [];

  // --- Payment factors -------------------------------------------------------
  if (input.firstTimePayee) {
    signals.push(buildContribution(DECISION_REASON_CODES.NEW_PAYEE, REASON_CODE_DEFINITIONS.NEW_PAYEE.baseWeight));
    rules.push('R-NEW-PAYEE');
  }
  if (input.payeeAgeDays <= 7 && !input.firstTimePayee) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.NEW_PAYEE_ACCOUNT,
        REASON_CODE_DEFINITIONS.NEW_PAYEE_ACCOUNT.baseWeight,
      ),
    );
    rules.push('R-NEW-PAYEE-ACCOUNT');
  }
  if (input.paymentAmount >= 2_000) {
    const contribution = input.paymentAmount >= 10_000 ? 18 : 10;
    signals.push(buildContribution(DECISION_REASON_CODES.HIGH_VALUE_PAYMENT, contribution));
    rules.push('R-HIGH-VALUE');
  }
  if (input.paymentVelocity24h >= 3) {
    const contribution = input.paymentVelocity24h >= 6 ? 12 : 8;
    signals.push(buildContribution(DECISION_REASON_CODES.ELEVATED_PAYMENT_VELOCITY, contribution));
    rules.push('R-VELOCITY');
  }

  // --- Telecom factors (only when the source is usable) ----------------------
  if (telecomUsable(input)) {
    if (input.recentSuspiciousCall) {
      signals.push(
        buildContribution(
          DECISION_REASON_CODES.RECENT_SUSPICIOUS_CALL,
          REASON_CODE_DEFINITIONS.RECENT_SUSPICIOUS_CALL.baseWeight,
        ),
      );
      rules.push('R-SUSPICIOUS-CALL');
    }
    if (
      input.callerReputation === CALLER_REPUTATIONS.SUSPECT ||
      input.callerReputation === CALLER_REPUTATIONS.KNOWN_BAD
    ) {
      const contribution = input.callerReputation === CALLER_REPUTATIONS.KNOWN_BAD ? 18 : 10;
      signals.push(buildContribution(DECISION_REASON_CODES.LOW_CALLER_REPUTATION, contribution));
      rules.push('R-CALLER-REPUTATION');
    }
    if (input.recentSuspiciousCall && input.callDurationSeconds >= 300) {
      signals.push(
        buildContribution(
          DECISION_REASON_CODES.PROLONGED_CALL_BEFORE_PAYMENT,
          REASON_CODE_DEFINITIONS.PROLONGED_CALL_BEFORE_PAYMENT.baseWeight,
        ),
      );
      rules.push('R-PROLONGED-CALL');
    }
  }

  // --- Behavioural and identity factors --------------------------------------
  if (input.deviceChange) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.RECENT_DEVICE_CHANGE,
        REASON_CODE_DEFINITIONS.RECENT_DEVICE_CHANGE.baseWeight,
      ),
    );
    rules.push('R-DEVICE-CHANGE');
  }
  if (input.accountTakeoverIndicators) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.ACCOUNT_TAKEOVER_SIGNALS,
        REASON_CODE_DEFINITIONS.ACCOUNT_TAKEOVER_SIGNALS.baseWeight,
      ),
    );
    rules.push('R-ATO');
  }
  if (input.scamCampaignMatch) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.SCAM_CAMPAIGN_MATCH,
        REASON_CODE_DEFINITIONS.SCAM_CAMPAIGN_MATCH.baseWeight,
      ),
    );
    rules.push('R-CAMPAIGN');
  }
  if (input.customerVulnerability) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.CUSTOMER_VULNERABILITY,
        REASON_CODE_DEFINITIONS.CUSTOMER_VULNERABILITY.baseWeight,
      ),
    );
    rules.push('R-VULNERABILITY');
  }
  if (input.identityVerificationResult === IDENTITY_VERIFICATION_RESULTS.FAIL) {
    signals.push(
      buildContribution(
        DECISION_REASON_CODES.IDENTITY_VERIFICATION_FAILED,
        REASON_CODE_DEFINITIONS.IDENTITY_VERIFICATION_FAILED.baseWeight,
      ),
    );
    rules.push('R-IDENTITY-FAIL');
  }
  if (input.previousWarnings >= 1) {
    const contribution = clamp(6 + (input.previousWarnings - 1) * 3, 6, 12);
    signals.push(buildContribution(DECISION_REASON_CODES.PRIOR_SCAM_WARNINGS, contribution));
    rules.push('R-PRIOR-WARNINGS');
  }

  const rawScore = signals.reduce((total, signal) => total + signal.contribution, 0);
  const riskScore = clamp(Math.round(rawScore), 0, 100);

  // --- Uncertainty: missing evidence never reads as zero risk ----------------
  const missingProviders: string[] = [];
  let uncertainty = 0.05;

  if (input.telecomEvidence === EVIDENCE_AVAILABILITY.UNAVAILABLE) {
    uncertainty += 0.25;
    missingProviders.push('telecom-risk-signals');
    rules.push('R-TELECOM-UNAVAILABLE');
  } else if (input.telecomEvidence === EVIDENCE_AVAILABILITY.NO_CONSENT) {
    uncertainty += 0.15;
    rules.push('R-TELECOM-NO-CONSENT');
  } else if (input.telecomEvidence === EVIDENCE_AVAILABILITY.OK_NO_SIGNALS) {
    uncertainty += 0.05;
  }

  if (input.identityVerificationResult === IDENTITY_VERIFICATION_RESULTS.NOT_CHECKED) {
    uncertainty += 0.1;
    missingProviders.push('identity-verification');
  }

  uncertainty = round2(clamp(uncertainty, 0, 1));

  // --- Level, with a floor for the strongest indicators ----------------------
  let level = levelForScore(riskScore);
  if (input.scamCampaignMatch || input.accountTakeoverIndicators) {
    level = maxLevel(level, 'HIGH');
    rules.push('R-CRITICAL-INDICATOR-FLOOR');
  }

  // Fail-neutral escalation: a materially incomplete picture on a non-trivial payment must
  // not settle as LOW/ALLOW just because we could not see the evidence.
  if (
    level === 'LOW' &&
    uncertainty >= 0.3 &&
    (input.paymentAmount >= 2_000 || input.firstTimePayee)
  ) {
    level = 'MEDIUM';
    rules.push('R-MISSING-EVIDENCE-ESCALATION');
  }

  const policy = selectAction({
    level,
    score: riskScore,
    uncertainty,
    campaignConfirmed: input.scamCampaignMatch,
  });

  const orderedSignals = [...signals].sort((a, b) => b.contribution - a.contribution);
  const summary = buildSummary(level, orderedSignals, policy.action);

  const evidenceSources: EvidenceSourceState[] = [
    { source: 'payment-intent', availability: EVIDENCE_AVAILABILITY.OK, detail: 'Synthetic payment intent supplied to the simulator.' },
    {
      source: 'telecom-risk-signals',
      availability: input.telecomEvidence,
      detail: telecomEvidenceDetail(input),
    },
    {
      source: 'identity-verification',
      availability:
        input.identityVerificationResult === IDENTITY_VERIFICATION_RESULTS.NOT_CHECKED
          ? EVIDENCE_AVAILABILITY.UNAVAILABLE
          : EVIDENCE_AVAILABILITY.OK,
      detail: `Identity verification result: ${input.identityVerificationResult}.`,
    },
  ];

  return {
    riskScore,
    riskLevel: level,
    uncertainty,
    recommendedAction: policy.action,
    alternativeActions: policy.alternatives,
    reasonCodes: orderedSignals.map((signal) => signal.code),
    contributingSignals: orderedSignals,
    rulesTriggered: [...rules, ...policy.rules],
    evidenceSources,
    missingProviders,
    policyVersion: POLICY_VERSION,
    rulesVersion: RULES_VERSION,
    summary,
  };
};

const telecomEvidenceDetail = (input: SimulatorEvaluateRequest): string => {
  switch (input.telecomEvidence) {
    case EVIDENCE_AVAILABILITY.OK:
      return 'Consented telecom signals were available and used.';
    case EVIDENCE_AVAILABILITY.OK_NO_SIGNALS:
      return 'Telecom source reachable, but no matching signals — distinct from unavailable.';
    case EVIDENCE_AVAILABILITY.NO_CONSENT:
      return 'No consent covers this subject, so no telecom lookup was performed.';
    case EVIDENCE_AVAILABILITY.UNAVAILABLE:
      return 'Telecom source could not answer in time; treated fail-neutral, not as zero risk.';
    default:
      return '';
  }
};

const buildSummary = (
  level: RiskLevel,
  orderedSignals: readonly ContributingSignal[],
  action: RecommendationAction,
): string => {
  const levelText: Record<RiskLevel, string> = {
    LOW: 'Low scam risk',
    MEDIUM: 'Moderate scam risk',
    HIGH: 'High scam risk',
    CRITICAL: 'Critical scam risk',
  };

  const actionText: Record<RecommendationAction, string> = {
    [RECOMMENDATION_ACTIONS.ALLOW]: 'no intervention is recommended',
    [RECOMMENDATION_ACTIONS.WARN]: 'a scam warning is recommended',
    [RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK]: 'a customer callback is recommended',
    [RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW]: 'analyst review is recommended',
    [RECOMMENDATION_ACTIONS.DELAY]: 'a short delay is recommended',
    [RECOMMENDATION_ACTIONS.BLOCK_RECOMMENDED]: 'the bank is advised to block pending review',
  };

  const top = orderedSignals.slice(0, 2).map((signal) => signal.title.toLowerCase());
  const because =
    top.length === 0
      ? 'no risk signals were triggered'
      : `driven by ${top.join(' and ')}`;

  return `${levelText[level]}: ${because}; ${actionText[action]}.`;
};
