/**
 * What the engine learns from resolved sessions.
 *
 * Every protection session ends with a fact: the payment was sent, abandoned, held or blocked,
 * and sometimes with a label saying whether it really was a scam. Accumulating those facts per
 * signal turns the engine's shipped constants into evidence — a signal that keeps appearing on
 * confirmed scams should count for more, and one that keeps appearing on ordinary payments
 * should count for less.
 *
 * This is deliberately statistics, not a model: it is inspectable, explains itself in a sentence
 * ("this signal accompanied a confirmed scam 8 times out of 10"), and cannot drift somewhere
 * surprising — which matters when the output is used to interrupt someone's own money.
 */

export interface SignalStat {
  readonly signalKey: string;
  /** How many resolved sessions carried this signal. */
  readonly observedCount: number;
  /** How many of those were confirmed scams. */
  readonly scamCount: number;
}

/**
 * Below this many observations a rate is noise, so the engine keeps its shipped weighting.
 * One unlucky Tuesday should not retune the network.
 */
export const MIN_OBSERVATIONS_TO_LEARN = 25;

/** The most a learned rate may move a signal's contribution, in either direction. */
export const MAX_LEARNED_MULTIPLIER = 1.5;
export const MIN_LEARNED_MULTIPLIER = 0.5;

/** The rate a signal is assumed to carry before there is evidence either way. */
const NEUTRAL_RATE = 0.5;

/**
 * The multiplier to apply to a signal's weight, given what has been observed about it.
 *
 * Returns exactly 1 (no change) until there is enough evidence, and is clamped so even a signal
 * that has never missed cannot run away with the score. Both properties matter: the engine should
 * improve with evidence without ever becoming unpredictable.
 */
export const learnedMultiplier = (stat: SignalStat | undefined): number => {
  if (stat === undefined || stat.observedCount < MIN_OBSERVATIONS_TO_LEARN) {
    return 1;
  }
  const rate = stat.scamCount / stat.observedCount;
  // Centre on the neutral rate: above it the signal earns more weight, below it less.
  const multiplier = 1 + (rate - NEUTRAL_RATE);
  return Math.max(MIN_LEARNED_MULTIPLIER, Math.min(MAX_LEARNED_MULTIPLIER, multiplier));
};

/**
 * Applies what has been learned to a base score.
 *
 * The multipliers of the signals that fired are averaged, so one well-evidenced signal cannot
 * dominate a payment that tripped several. The result stays inside 0–100.
 */
export const applyLearning = (
  baseScore: number,
  firedSignalKeys: readonly string[],
  stats: ReadonlyMap<string, SignalStat>,
): number => {
  if (firedSignalKeys.length === 0) {
    return baseScore;
  }
  const multipliers = firedSignalKeys.map((key) => learnedMultiplier(stats.get(key)));
  const average = multipliers.reduce((total, value) => total + value, 0) / multipliers.length;
  return Math.max(0, Math.min(100, Math.round(baseScore * average)));
};

/**
 * The signal keys one session contributes to learning: the reason codes that fired, plus each
 * answer the customer gave. Answers are namespaced so `asked_to_pay:yes` never collides with a
 * reason code.
 */
export const sessionSignalKeys = (
  reasonCodes: readonly string[],
  answerKeys: readonly string[],
): readonly string[] => [...reasonCodes, ...answerKeys.map((key) => `answer:${key}`)];
