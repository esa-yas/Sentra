/**
 * Application core: domain rules and use cases. Depends on ports and shared contracts only
 * — never on a provider SDK or a delivery framework (enforced by dependency-cruiser).
 */
export {
  REASON_CODE_DEFINITIONS,
  type ReasonCodeDefinition,
  type ReasonCategory,
} from './decision/reason-codes';
export {
  RULES_VERSION,
  POLICY_VERSION,
  RISK_LEVEL_THRESHOLDS,
  HIGH_UNCERTAINTY_THRESHOLD,
  BLOCK_RECOMMENDATION_SCORE,
  AUTHORITY_NOTE,
  levelForScore,
  maxLevel,
  selectAction,
  type PolicyDecision,
} from './decision/policy';
export { evaluateScamRisk, type RiskAssessment } from './decision/risk-engine';
export {
  createEvaluatePaymentRiskUseCase,
  type EvaluatePaymentRiskDeps,
  type EvaluatePaymentRiskContext,
  type EvaluatePaymentRiskOutput,
  type EvaluatePaymentRiskUseCase,
} from './decision/evaluate-payment-risk';
export { SIMULATOR_SCENARIOS, SYNTHETIC_BANK_SLUG, SYNTHETIC_DEMO_SUBJECT_REF, SYNTHETIC_TELECOM_SLUG } from './decision/scenarios';
export {
  createResolveUserPrincipalUseCase,
  type ResolveUserPrincipalDeps,
  type ResolveUserPrincipalUseCase,
  type ResolvedUserSession,
} from './identity/resolve-user-principal';

export {
  QUESTION_BANK,
  selectQuestions,
  toPollQuestion,
  signalForAnswer,
  answerSignalKey,
  type QuestionDefinition,
  type QuestionOptionDefinition,
} from './protection/questions';
export {
  toDisplayReasons,
  verdictForScore,
  adjustScoreForAnswers,
  buildDisplay,
  type ReasonInput,
  type DisplayInput,
} from './protection/customer-view';
export {
  learnedMultiplier,
  applyLearning,
  sessionSignalKeys,
  MIN_OBSERVATIONS_TO_LEARN,
  MAX_LEARNED_MULTIPLIER,
  MIN_LEARNED_MULTIPLIER,
  type SignalStat,
} from './protection/learning';
