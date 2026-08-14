import {
  RECOMMENDATION_ACTIONS,
  RISK_LEVELS,
  type RecommendationAction,
  type RiskLevel,
} from '@sentra/contracts';

/**
 * Policy and rules versions. Slide 068 keeps rules, scoring, and policy independently
 * versioned; slide 069 requires both versions on every recommendation so a decision can be
 * reproduced. Bump these whenever weights or thresholds change.
 */
export const RULES_VERSION = 'rules-2026.08.1';
export const POLICY_VERSION = 'policy-2026.08.1';

/** Score cut-points for each level. A score at a boundary takes the higher level. */
export const RISK_LEVEL_THRESHOLDS: ReadonlyArray<{ min: number; level: RiskLevel }> = [
  { min: 75, level: RISK_LEVELS.CRITICAL },
  { min: 50, level: RISK_LEVELS.HIGH },
  { min: 25, level: RISK_LEVELS.MEDIUM },
  { min: 0, level: RISK_LEVELS.LOW },
];

export const levelForScore = (score: number): RiskLevel => {
  for (const threshold of RISK_LEVEL_THRESHOLDS) {
    if (score >= threshold.min) {
      return threshold.level;
    }
  }
  return RISK_LEVELS.LOW;
};

const LEVEL_ORDER: readonly RiskLevel[] = [
  RISK_LEVELS.LOW,
  RISK_LEVELS.MEDIUM,
  RISK_LEVELS.HIGH,
  RISK_LEVELS.CRITICAL,
];

export const maxLevel = (a: RiskLevel, b: RiskLevel): RiskLevel =>
  LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;

/**
 * When evidence is materially incomplete the decision must not read as "no risk"
 * (slide 035). Above this uncertainty the policy escalates a borderline recommendation.
 */
export const HIGH_UNCERTAINTY_THRESHOLD = 0.4;

/** Score above which a campaign-confirmed case may warrant the strongest recommendation. */
export const BLOCK_RECOMMENDATION_SCORE = 90;

export interface PolicyDecision {
  readonly action: RecommendationAction;
  readonly alternatives: readonly RecommendationAction[];
  readonly rules: readonly string[];
}

/**
 * Chooses the recommended action from the level, the uncertainty, and whether a live scam
 * campaign was confirmed. Every action is advisory: the bank makes the final call.
 */
export const selectAction = (params: {
  readonly level: RiskLevel;
  readonly score: number;
  readonly uncertainty: number;
  readonly campaignConfirmed: boolean;
}): PolicyDecision => {
  const { level, score, uncertainty, campaignConfirmed } = params;
  const rules: string[] = [`P-ACTION-${level}`];

  switch (level) {
    case RISK_LEVELS.LOW:
      return { action: RECOMMENDATION_ACTIONS.ALLOW, alternatives: [], rules };

    case RISK_LEVELS.MEDIUM:
      return {
        action: RECOMMENDATION_ACTIONS.WARN,
        alternatives: [RECOMMENDATION_ACTIONS.ALLOW],
        rules,
      };

    case RISK_LEVELS.HIGH: {
      if (uncertainty >= HIGH_UNCERTAINTY_THRESHOLD) {
        rules.push('P-ESCALATE-UNCERTAINTY');
        return {
          action: RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW,
          alternatives: [RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK, RECOMMENDATION_ACTIONS.WARN],
          rules,
        };
      }
      return {
        action: RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK,
        alternatives: [RECOMMENDATION_ACTIONS.WARN, RECOMMENDATION_ACTIONS.DELAY],
        rules,
      };
    }

    case RISK_LEVELS.CRITICAL: {
      if (campaignConfirmed && score >= BLOCK_RECOMMENDATION_SCORE) {
        rules.push('P-BLOCK-RECOMMENDATION');
        return {
          action: RECOMMENDATION_ACTIONS.BLOCK_RECOMMENDED,
          alternatives: [
            RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW,
            RECOMMENDATION_ACTIONS.DELAY,
          ],
          rules,
        };
      }
      return {
        action: RECOMMENDATION_ACTIONS.REQUIRE_ANALYST_REVIEW,
        alternatives: [RECOMMENDATION_ACTIONS.REQUIRE_CALLBACK, RECOMMENDATION_ACTIONS.DELAY],
        rules,
      };
    }

    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
};

/**
 * The bank always retains final authority (slides 010, 030). This sentence accompanies
 * every recommendation so the wording stays "recommendation", never an autonomous block.
 */
export const AUTHORITY_NOTE =
  'This is an advisory recommendation. The bank retains final authority over the payment decision.';
