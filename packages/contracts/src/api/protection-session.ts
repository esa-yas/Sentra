import { z } from 'zod';
import { riskLevelSchema } from './decision';
import { ulidSchema } from '../identifiers';

/**
 * Protection sessions — the contract between a bank's app and the Sentra engine.
 *
 * A session is opened on the transfer-confirmation screen, before money moves. The engine does
 * not merely return a score: it returns everything the SDK needs to *render* the moment — the
 * headline, the plain-English reasons, and the questions worth asking this particular customer.
 * The SDK stays presentation-only, so improving how a scam is explained never needs an app release.
 *
 * The flow is three calls:
 *   1. open    — payment context in, verdict + display + questions out
 *   2. answer  — the customer's answers in, a revised verdict out
 *   3. resolve — what actually happened, which is what the engine learns from
 */

/** What the SDK should do with the payment. Advisory: the bank always decides. */
export const PROTECTION_VERDICTS = {
  /** Nothing to show. Let the transfer continue silently. */
  PROCEED: 'PROCEED',
  /** Show the warning and the questions, but the customer may continue. */
  WARN: 'WARN',
  /** Advise the bank to hold the payment and route it for review. */
  HOLD: 'HOLD',
} as const;

export type ProtectionVerdict = (typeof PROTECTION_VERDICTS)[keyof typeof PROTECTION_VERDICTS];

export const protectionVerdictSchema = z.enum([
  PROTECTION_VERDICTS.PROCEED,
  PROTECTION_VERDICTS.WARN,
  PROTECTION_VERDICTS.HOLD,
]);

/** Where a held payment goes for review, mirroring the customer's guardian settings. */
export const REVIEW_ROUTES = {
  NONE: 'NONE',
  BANK: 'BANK',
  GUARDIAN: 'GUARDIAN',
  GUARDIAN_THEN_BANK: 'GUARDIAN_THEN_BANK',
} as const;

export type ReviewRoute = (typeof REVIEW_ROUTES)[keyof typeof REVIEW_ROUTES];

export const reviewRouteSchema = z.enum([
  REVIEW_ROUTES.NONE,
  REVIEW_ROUTES.BANK,
  REVIEW_ROUTES.GUARDIAN,
  REVIEW_ROUTES.GUARDIAN_THEN_BANK,
]);

/**
 * What an answer tells the engine. The SDK never interprets answers itself — it returns the
 * chosen option and the engine decides what it means, so the meaning can change server-side.
 */
export const ANSWER_SIGNALS = {
  /** Consistent with a scam in progress (e.g. "yes, someone asked me to move this money"). */
  ELEVATES: 'ELEVATES',
  /** Neither raises nor lowers suspicion. */
  NEUTRAL: 'NEUTRAL',
  /** Reassuring (e.g. "I have paid this person many times"). */
  REASSURES: 'REASSURES',
} as const;

export type AnswerSignal = (typeof ANSWER_SIGNALS)[keyof typeof ANSWER_SIGNALS];

export const answerSignalSchema = z.enum([
  ANSWER_SIGNALS.ELEVATES,
  ANSWER_SIGNALS.NEUTRAL,
  ANSWER_SIGNALS.REASSURES,
]);

// ---------------------------------------------------------------------------
// Opening a session
// ---------------------------------------------------------------------------

/**
 * The payment as the customer is about to confirm it. Risk-relevant fields only — never card or
 * account numbers, and never credentials.
 */
export const protectionSessionRequestSchema = z
  .object({
    /** Shared pseudonymous customer reference; the join with any telecom signal. */
    subjectRef: z.string().min(3).max(128),
    amount: z.number().nonnegative().max(100_000_000),
    currency: z.string().length(3).default('GBP'),
    /** Display name only, so the warning can say who the money is going to. */
    payeeLabel: z.string().trim().max(80).optional(),
    firstTimePayee: z.boolean().default(false),
    payeeAgeDays: z.number().int().min(0).max(36_500).default(0),
    paymentVelocity24h: z.number().int().min(0).max(1_000).default(0),
    /** True when the device reports an active call — the strongest live signal there is. */
    onPhoneCall: z.boolean().default(false),
    /** True when that call is with a number not in the customer's contacts. */
    callerUnknown: z.boolean().default(false),
    deviceChange: z.boolean().default(false),
    previousWarnings: z.number().int().min(0).max(1_000).default(0),
    /** Locale for the returned copy. Only 'en' is served today; others fall back to it. */
    locale: z.string().min(2).max(8).default('en'),
  })
  .strict();

export type ProtectionSessionRequest = z.infer<typeof protectionSessionRequestSchema>;

/** One reason, written for the customer rather than for a fraud analyst. */
export const displayReasonSchema = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string(),
});

export type DisplayReason = z.infer<typeof displayReasonSchema>;

/**
 * Everything the SDK renders. The engine owns this copy so the wording of a warning can be
 * improved for every bank at once, without any of them shipping a new app build.
 */
export const customerDisplaySchema = z.object({
  /** Visual weight for the screen: informational, cautionary, or a full stop. */
  tone: z.enum(['INFO', 'CAUTION', 'STOP']),
  headline: z.string(),
  body: z.string(),
  reasons: z.array(displayReasonSchema),
  /** Label for the button that continues the payment; absent when the advice is to hold. */
  continueLabel: z.string().optional(),
  /** Label for the safer choice, which is always offered. */
  cancelLabel: z.string(),
  /** The reassurance line shown under the buttons. */
  footnote: z.string(),
});

export type CustomerDisplay = z.infer<typeof customerDisplaySchema>;

export const pollOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const pollQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  /** Why this is being asked, shown small under the prompt. */
  helper: z.string().optional(),
  options: z.array(pollOptionSchema).min(2).max(4),
});

export type PollQuestion = z.infer<typeof pollQuestionSchema>;

export const protectionSessionResponseSchema = z.object({
  sessionId: ulidSchema,
  verdict: protectionVerdictSchema,
  riskLevel: riskLevelSchema,
  /** 0–100. Shown to the bank, never to the customer. */
  riskScore: z.number().min(0).max(100),
  display: customerDisplaySchema,
  /** Questions worth asking this customer, chosen from the reasons that actually fired. */
  questions: z.array(pollQuestionSchema),
  /** Short, human reference the customer can quote to the bank, e.g. "AC-236". */
  caseReference: z.string(),
  correlationId: z.string(),
});

export type ProtectionSessionResponse = z.infer<typeof protectionSessionResponseSchema>;

// ---------------------------------------------------------------------------
// Answering the questions
// ---------------------------------------------------------------------------

export const submitAnswersRequestSchema = z
  .object({
    answers: z
      .array(z.object({ questionId: z.string(), optionId: z.string() }))
      .min(1)
      .max(6),
  })
  .strict();

export type SubmitAnswersRequest = z.infer<typeof submitAnswersRequestSchema>;

export const submitAnswersResponseSchema = z.object({
  sessionId: ulidSchema,
  verdict: protectionVerdictSchema,
  riskLevel: riskLevelSchema,
  riskScore: z.number().min(0).max(100),
  display: customerDisplaySchema,
  /** Where the bank should send this for review when the verdict is HOLD. */
  reviewRoute: reviewRouteSchema,
  caseReference: z.string(),
});

export type SubmitAnswersResponse = z.infer<typeof submitAnswersResponseSchema>;

// ---------------------------------------------------------------------------
// Resolving — this is what the engine learns from
// ---------------------------------------------------------------------------

export const SESSION_OUTCOMES = {
  /** The payment went through. */
  SENT: 'SENT',
  /** The customer stopped of their own accord after seeing the warning. */
  ABANDONED: 'ABANDONED',
  /** The bank held it for review. */
  HELD: 'HELD',
  /** The bank blocked it. */
  BLOCKED: 'BLOCKED',
} as const;

export type SessionOutcome = (typeof SESSION_OUTCOMES)[keyof typeof SESSION_OUTCOMES];

export const sessionOutcomeSchema = z.enum([
  SESSION_OUTCOMES.SENT,
  SESSION_OUTCOMES.ABANDONED,
  SESSION_OUTCOMES.HELD,
  SESSION_OUTCOMES.BLOCKED,
]);

export const resolveSessionRequestSchema = z
  .object({
    outcome: sessionOutcomeSchema,
    /**
     * Whether this turned out to be a scam, once known. This is the label the engine learns
     * from; omit it while it is genuinely unknown rather than guessing.
     */
    confirmedScam: z.boolean().optional(),
  })
  .strict();

export type ResolveSessionRequest = z.infer<typeof resolveSessionRequestSchema>;

export const resolveSessionResponseSchema = z.object({
  sessionId: ulidSchema,
  outcome: sessionOutcomeSchema,
  recordedAt: z.string().datetime(),
});

export type ResolveSessionResponse = z.infer<typeof resolveSessionResponseSchema>;
