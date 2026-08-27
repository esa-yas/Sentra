import {
  ANSWER_SIGNALS,
  PROTECTION_VERDICTS,
  type AnswerSignal,
  type CustomerDisplay,
  type DisplayReason,
  type ProtectionVerdict,
  type RiskLevel,
} from '@sentra/contracts';

/**
 * Turning a risk assessment into something a worried person can act on.
 *
 * The engine's own reason descriptions are written for fraud analysts ("the customer has never
 * paid this payee before"). At the moment of payment the customer needs the second person, the
 * present tense, and the reason it matters to *them*. This module owns that translation, so the
 * wording can be improved for every bank at once without any of them shipping an app release.
 *
 * The tone is deliberately plain. Scam warnings that sound like legal boilerplate get dismissed;
 * warnings that name the specific thing happening right now are the ones people stop for.
 */

/** Customer-facing copy for each reason code. Falls back to the engine's own text when absent. */
const CUSTOMER_REASONS: Readonly<Record<string, { title: string; detail: string }>> = {
  NEW_PAYEE: {
    title: 'You’ve never paid this person before',
    detail: 'Most scam payments are the first one to a brand-new payee.',
  },
  NEW_PAYEE_ACCOUNT: {
    title: 'This payee was added very recently',
    detail: 'Scammers get added moments before the money is sent.',
  },
  HIGH_VALUE_PAYMENT: {
    title: 'This is a large amount',
    detail: 'Larger than you usually send, and larger than most payments we protect.',
  },
  ELEVATED_PAYMENT_VELOCITY: {
    title: 'Several payments in a short time',
    detail: 'Being pushed to send more than once quickly is a common pressure tactic.',
  },
  RECENT_SUSPICIOUS_CALL: {
    title: 'A suspicious call is happening right now',
    detail: 'No bank, police force or government office will ever stay on the phone while you move money.',
  },
  CALLER_REPUTATION_POOR: {
    title: 'That number has been reported before',
    detail: 'Other people have reported the number you are speaking to.',
  },
  PROLONGED_CALL_OVERLAP: {
    title: 'You’ve been on this call a long time',
    detail: 'Long calls during a payment usually mean someone is guiding you through it.',
  },
  DEVICE_CHANGE_RECENT: {
    title: 'This is a new device',
    detail: 'Your account was used from a device we haven’t seen before.',
  },
  ACCOUNT_TAKEOVER_SIGNALS: {
    title: 'Unusual activity on your account',
    detail: 'We’ve seen signs that someone else may have access.',
  },
  SCAM_CAMPAIGN_MATCH: {
    title: 'This matches a scam we’re tracking',
    detail: 'The pattern matches an active scam other people have reported.',
  },
  IDENTITY_VERIFICATION_FAILED: {
    title: 'An identity check didn’t pass',
    detail: 'A verification step failed earlier in this session.',
  },
  PREVIOUS_WARNINGS: {
    title: 'You’ve been warned before',
    detail: 'We’ve flagged risk on your recent payments.',
  },
  VULNERABILITY_SIGNAL: {
    title: 'Extra protection is on for this account',
    detail: 'You or your family asked us to take extra care with payments like this.',
  },
};

export interface ReasonInput {
  readonly code: string;
  /** The engine's analyst-facing title, used when no customer copy exists for the code. */
  readonly title: string;
  readonly description: string;
}

/** Rewrites the reasons that fired into customer-facing language, strongest first. */
export const toDisplayReasons = (reasons: readonly ReasonInput[]): DisplayReason[] =>
  reasons.slice(0, 4).map((reason) => {
    const copy = CUSTOMER_REASONS[reason.code];
    return {
      code: reason.code,
      title: copy?.title ?? reason.title,
      detail: copy?.detail ?? reason.description,
    };
  });

/**
 * The verdict for a score. Deliberately conservative at the top: a HOLD interrupts someone's own
 * money, so it is reserved for scores where the evidence is strong.
 */
export const verdictForScore = (score: number): ProtectionVerdict => {
  if (score >= 70) return PROTECTION_VERDICTS.HOLD;
  if (score >= 40) return PROTECTION_VERDICTS.WARN;
  return PROTECTION_VERDICTS.PROCEED;
};

/**
 * How much the customer's own answers move the score.
 *
 * An answer is the only first-hand account the engine ever gets, so it is weighted heavily —
 * "yes, someone asked me to move this money" is worth more than any inferred signal. Reassuring
 * answers pull the score down, but by less than an elevating one pushes it up: a scammer can
 * coach a victim into a comforting answer, so reassurance is treated as weaker evidence.
 */
export const adjustScoreForAnswers = (
  baseScore: number,
  signals: readonly AnswerSignal[],
): number => {
  const delta = signals.reduce((total, signal) => {
    if (signal === ANSWER_SIGNALS.ELEVATES) return total + 18;
    if (signal === ANSWER_SIGNALS.REASSURES) return total - 8;
    return total;
  }, 0);
  return Math.max(0, Math.min(100, Math.round(baseScore + delta)));
};

const AMOUNT_FORMAT_FALLBACK = (amount: number, currency: string): string =>
  `${currency} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatAmount = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return AMOUNT_FORMAT_FALLBACK(amount, currency);
  }
};

export interface DisplayInput {
  readonly verdict: ProtectionVerdict;
  readonly riskLevel: RiskLevel;
  readonly amount: number;
  readonly currency: string;
  readonly payeeLabel?: string;
  readonly reasons: readonly DisplayReason[];
  /** Set once the customer has answered, so the copy can acknowledge what they told us. */
  readonly afterAnswers?: boolean;
}

/**
 * Builds the screen. Every variant keeps the safer choice available and never shames the
 * customer — people abandon a scam far more readily when stopping feels like a sensible choice
 * rather than an admission that they were fooled.
 */
export const buildDisplay = (input: DisplayInput): CustomerDisplay => {
  const money = formatAmount(input.amount, input.currency);
  const to = input.payeeLabel === undefined || input.payeeLabel === '' ? '' : ` to ${input.payeeLabel}`;

  if (input.verdict === PROTECTION_VERDICTS.HOLD) {
    return {
      tone: 'STOP',
      headline: 'Stop — this looks like a scam',
      body: input.afterAnswers === true
        ? `What you’ve told us matches how scams work. We’ve asked your bank to hold this ${money} payment${to} until someone can check it with you.`
        : `We think someone may be tricking you into sending this ${money} payment${to}. We’ve asked your bank to hold it while this is checked.`,
      reasons: [...input.reasons],
      cancelLabel: 'Cancel this payment',
      footnote: 'Your money stays in your account. Your bank will confirm before anything is sent.',
    };
  }

  if (input.verdict === PROTECTION_VERDICTS.WARN) {
    return {
      tone: 'CAUTION',
      headline: 'Please check before you send',
      body: `Something about this ${money} payment${to} looks unusual. Take a moment — a real organisation will never mind you pausing to check.`,
      reasons: [...input.reasons],
      continueLabel: 'I’ve checked — send anyway',
      cancelLabel: 'Cancel this payment',
      footnote: 'If anyone is rushing you or telling you to ignore this, it is a scam.',
    };
  }

  return {
    tone: 'INFO',
    headline: 'Payment checked',
    body: `We didn’t see anything unusual about this ${money} payment${to}.`,
    reasons: [],
    continueLabel: 'Send payment',
    cancelLabel: 'Cancel',
    footnote: 'We check every payment for signs of a scam.',
  };
};
