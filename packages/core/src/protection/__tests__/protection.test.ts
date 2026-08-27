import { describe, expect, it } from 'vitest';
import { selectQuestions, signalForAnswer, toPollQuestion } from '../questions';
import { adjustScoreForAnswers, buildDisplay, toDisplayReasons, verdictForScore } from '../customer-view';
import { applyLearning, learnedMultiplier, MIN_OBSERVATIONS_TO_LEARN, type SignalStat } from '../learning';

describe('question selection', () => {
  it('always asks the most discriminating question, even with no reasons', () => {
    const ids = selectQuestions([]).map((q) => q.id);
    expect(ids).toContain('asked_to_pay');
  });

  it('asks about a live call only when a call signal fired', () => {
    expect(selectQuestions([]).map((q) => q.id)).not.toContain('on_call_now');
    expect(selectQuestions(['RECENT_SUSPICIOUS_CALL']).map((q) => q.id)).toContain('on_call_now');
  });

  it('never asks more than three questions', () => {
    const many = selectQuestions([
      'RECENT_SUSPICIOUS_CALL',
      'NEW_PAYEE',
      'HIGH_VALUE_PAYMENT',
      'SCAM_CAMPAIGN_MATCH',
      'NEW_PAYEE_ACCOUNT',
    ]);
    expect(many.length).toBeLessThanOrEqual(3);
  });

  // The SDK must never learn what an answer means; that stays server-side.
  it('does not leak answer meanings to the SDK', () => {
    const wire = toPollQuestion(selectQuestions([])[0]!);
    expect(JSON.stringify(wire)).not.toContain('ELEVATES');
    expect(wire.options.every((o) => !('signal' in o))).toBe(true);
  });

  it('resolves an answer to its meaning, and ignores unknown ids rather than guessing', () => {
    expect(signalForAnswer('asked_to_pay', 'yes')).toBe('ELEVATES');
    expect(signalForAnswer('asked_to_pay', 'no')).toBe('NEUTRAL');
    expect(signalForAnswer('nope', 'yes')).toBeNull();
    expect(signalForAnswer('asked_to_pay', 'nope')).toBeNull();
  });
});

describe('verdict and answers', () => {
  it('maps scores to verdicts, reserving a hold for strong evidence', () => {
    expect(verdictForScore(10)).toBe('PROCEED');
    expect(verdictForScore(45)).toBe('WARN');
    expect(verdictForScore(80)).toBe('HOLD');
  });

  it('an elevating answer can turn a warning into a hold', () => {
    const base = 55;
    expect(verdictForScore(base)).toBe('WARN');
    expect(verdictForScore(adjustScoreForAnswers(base, ['ELEVATES']))).toBe('HOLD');
  });

  // A scammer can coach a victim into a comforting answer, so reassurance is weaker evidence.
  it('weights reassurance less than suspicion, and stays within 0–100', () => {
    expect(adjustScoreForAnswers(50, ['ELEVATES']) - 50).toBeGreaterThan(
      50 - adjustScoreForAnswers(50, ['REASSURES']),
    );
    expect(adjustScoreForAnswers(2, ['REASSURES'])).toBe(0);
    expect(adjustScoreForAnswers(99, ['ELEVATES', 'ELEVATES'])).toBe(100);
  });
});

describe('customer copy', () => {
  it('rewrites analyst wording into the second person', () => {
    const [reason] = toDisplayReasons([
      { code: 'NEW_PAYEE', title: 'First-time payee', description: 'The customer has never paid this payee before.' },
    ]);
    expect(reason!.title).toMatch(/you/i);
    expect(reason!.detail).not.toContain('The customer');
  });

  it('falls back to the engine text for a code with no customer copy', () => {
    const [reason] = toDisplayReasons([
      { code: 'SOME_NEW_CODE', title: 'Engine title', description: 'Engine description.' },
    ]);
    expect(reason).toEqual({ code: 'SOME_NEW_CODE', title: 'Engine title', detail: 'Engine description.' });
  });

  it('offers no "send anyway" on a hold, but always a way to stop', () => {
    const hold = buildDisplay({ verdict: 'HOLD', riskLevel: 'CRITICAL', amount: 8400, currency: 'GBP', reasons: [] });
    expect(hold.continueLabel).toBeUndefined();
    expect(hold.cancelLabel).toBeTruthy();

    const warn = buildDisplay({ verdict: 'WARN', riskLevel: 'HIGH', amount: 8400, currency: 'GBP', reasons: [] });
    expect(warn.continueLabel).toBeTruthy();
    expect(warn.cancelLabel).toBeTruthy();
  });

  it('names the amount and payee so the warning is about this payment', () => {
    const display = buildDisplay({
      verdict: 'WARN', riskLevel: 'HIGH', amount: 8400, currency: 'GBP',
      payeeLabel: 'J. Smith', reasons: [],
    });
    expect(display.body).toContain('8,400');
    expect(display.body).toContain('J. Smith');
  });
});

describe('learning', () => {
  const stat = (observed: number, scam: number): SignalStat => ({
    signalKey: 'NEW_PAYEE', observedCount: observed, scamCount: scam,
  });

  // One unlucky Tuesday must not retune the network.
  it('does not learn from too little evidence', () => {
    expect(learnedMultiplier(undefined)).toBe(1);
    expect(learnedMultiplier(stat(MIN_OBSERVATIONS_TO_LEARN - 1, 20))).toBe(1);
  });

  it('raises a signal that keeps accompanying confirmed scams', () => {
    expect(learnedMultiplier(stat(100, 90))).toBeGreaterThan(1);
  });

  it('lowers a signal that keeps appearing on ordinary payments', () => {
    expect(learnedMultiplier(stat(100, 5))).toBeLessThan(1);
  });

  // Even a signal that has never missed cannot run away with the score.
  it('clamps the multiplier in both directions', () => {
    expect(learnedMultiplier(stat(1000, 1000))).toBeLessThanOrEqual(1.5);
    expect(learnedMultiplier(stat(1000, 0))).toBeGreaterThanOrEqual(0.5);
  });

  it('leaves the score untouched when nothing fired', () => {
    expect(applyLearning(60, [], new Map())).toBe(60);
  });

  it('averages multipliers so one signal cannot dominate', () => {
    const stats = new Map<string, SignalStat>([
      ['A', { signalKey: 'A', observedCount: 100, scamCount: 100 }],
      ['B', { signalKey: 'B', observedCount: 100, scamCount: 0 }],
    ]);
    expect(applyLearning(60, ['A', 'B'], stats)).toBe(60);
  });
});
