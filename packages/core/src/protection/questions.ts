import { ANSWER_SIGNALS, type AnswerSignal, type PollQuestion } from '@sentra/contracts';

/**
 * The questions worth asking at the confirmation screen.
 *
 * Scammers coach victims with a script ("say it's for home improvement"). A short, pointed
 * question breaks that script: the customer has to answer for themselves, and hesitating over
 * "did someone ask you to move this money?" is often the moment the spell breaks. The answers are
 * also the cleanest signal the engine ever gets — the customer's own account of what is happening.
 *
 * Each question is tied to the reason codes that make it worth asking, so a customer is never
 * asked something irrelevant to their situation. Options carry an {@link AnswerSignal} the engine
 * (never the SDK) interprets, so the meaning of an answer can be retuned server-side.
 */
export interface QuestionOptionDefinition {
  readonly id: string;
  readonly label: string;
  readonly signal: AnswerSignal;
}

export interface QuestionDefinition {
  readonly id: string;
  readonly prompt: string;
  readonly helper?: string;
  /** Asked when any of these reason codes fired. Empty means "always a candidate". */
  readonly triggeredBy: readonly string[];
  /** Higher is asked first. The screen shows at most three. */
  readonly priority: number;
  readonly options: readonly QuestionOptionDefinition[];
}

const YES_NO_UNSURE = (yes: AnswerSignal): readonly QuestionOptionDefinition[] => [
  { id: 'yes', label: 'Yes', signal: yes },
  { id: 'no', label: 'No', signal: ANSWER_SIGNALS.NEUTRAL },
  { id: 'unsure', label: 'I’m not sure', signal: ANSWER_SIGNALS.ELEVATES },
];

/**
 * The question bank. Kept small on purpose: three questions is the most a person will answer
 * honestly at a payment screen, and every extra one costs completion.
 */
export const QUESTION_BANK: readonly QuestionDefinition[] = [
  {
    id: 'asked_to_pay',
    prompt: 'Did someone contact you and ask you to make this payment?',
    helper: 'A call, text, email or message — from anyone.',
    triggeredBy: [],
    priority: 100,
    options: YES_NO_UNSURE(ANSWER_SIGNALS.ELEVATES),
  },
  {
    id: 'on_call_now',
    prompt: 'Are you on a phone call right now?',
    helper: 'Genuine organisations never ask you to move money while they stay on the line.',
    triggeredBy: ['RECENT_SUSPICIOUS_CALL', 'PROLONGED_CALL_OVERLAP', 'CALLER_REPUTATION_POOR'],
    priority: 95,
    options: YES_NO_UNSURE(ANSWER_SIGNALS.ELEVATES),
  },
  {
    id: 'told_to_keep_secret',
    prompt: 'Were you told to keep this payment private, or to ignore any warnings?',
    helper: 'No bank or authority will ever ask you to do this.',
    triggeredBy: ['RECENT_SUSPICIOUS_CALL', 'SCAM_CAMPAIGN_MATCH', 'ACCOUNT_TAKEOVER_SIGNALS'],
    priority: 90,
    options: YES_NO_UNSURE(ANSWER_SIGNALS.ELEVATES),
  },
  {
    id: 'know_payee',
    prompt: 'Have you met or spoken to this person before today?',
    triggeredBy: ['NEW_PAYEE', 'NEW_PAYEE_ACCOUNT'],
    priority: 70,
    options: [
      { id: 'yes_known', label: 'Yes, I know them', signal: ANSWER_SIGNALS.REASSURES },
      { id: 'only_today', label: 'Only today', signal: ANSWER_SIGNALS.ELEVATES },
      { id: 'never', label: 'No, never', signal: ANSWER_SIGNALS.ELEVATES },
    ],
  },
  {
    id: 'payment_purpose',
    prompt: 'What is this payment for?',
    triggeredBy: ['HIGH_VALUE_PAYMENT', 'NEW_PAYEE'],
    priority: 60,
    options: [
      { id: 'known_person', label: 'Someone I know', signal: ANSWER_SIGNALS.REASSURES },
      { id: 'goods', label: 'Goods or services', signal: ANSWER_SIGNALS.NEUTRAL },
      { id: 'safe_account', label: 'Moving it to a “safe account”', signal: ANSWER_SIGNALS.ELEVATES },
      { id: 'investment', label: 'An investment opportunity', signal: ANSWER_SIGNALS.ELEVATES },
    ],
  },
];

const MAX_QUESTIONS = 3;

/**
 * Picks the questions to ask for one payment.
 *
 * "Did someone ask you to make this payment?" is always in scope — it is the single most
 * discriminating question for authorized-push-payment scams. The rest are chosen by which reason
 * codes actually fired, so the screen stays short and every question earns its place.
 */
export const selectQuestions = (reasonCodes: readonly string[]): readonly QuestionDefinition[] => {
  const fired = new Set(reasonCodes);
  return QUESTION_BANK.filter(
    (question) =>
      question.triggeredBy.length === 0 ||
      question.triggeredBy.some((code) => fired.has(code)),
  )
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_QUESTIONS);
};

/** Strips the answer meanings before the questions go to the SDK. */
export const toPollQuestion = (question: QuestionDefinition): PollQuestion => ({
  id: question.id,
  prompt: question.prompt,
  ...(question.helper === undefined ? {} : { helper: question.helper }),
  options: question.options.map((option) => ({ id: option.id, label: option.label })),
});

/** Resolves a submitted answer back to its meaning. Unknown ids are ignored, never guessed. */
export const signalForAnswer = (questionId: string, optionId: string): AnswerSignal | null => {
  const question = QUESTION_BANK.find((candidate) => candidate.id === questionId);
  const option = question?.options.find((candidate) => candidate.id === optionId);
  return option?.signal ?? null;
};

/** The key an answer is recorded under for learning, e.g. `asked_to_pay:yes`. */
export const answerSignalKey = (questionId: string, optionId: string): string =>
  `${questionId}:${optionId}`;
