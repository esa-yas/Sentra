import type { Purpose } from '@sentra/contracts';

/**
 * Bounded AI assistance.
 *
 * Slides 061 and 070 are unambiguous: the model never owns payment authority, its output is
 * always schema-validated, and a timeout or an invalid response falls back to deterministic
 * rules. This interface encodes those constraints rather than trusting a caller to remember
 * them.
 *
 * Gemini implements it first; Vertex AI replaces the adapter later (slide 046).
 */

/** The only tasks a model is permitted to perform. */
export const AI_TASKS = {
  /** Map redacted evidence onto a closed set of scam indicator codes. */
  CLASSIFY_INDICATORS: 'CLASSIFY_INDICATORS',
  /** Summarise a case for a human analyst. */
  SUMMARISE_FOR_ANALYST: 'SUMMARISE_FOR_ANALYST',
  /** Turn reason codes into plain-language customer-facing text. */
  EXPLAIN_IN_PLAIN_LANGUAGE: 'EXPLAIN_IN_PLAIN_LANGUAGE',
  /** Extract structured indicators from consented, redacted text. */
  EXTRACT_INDICATORS: 'EXTRACT_INDICATORS',
} as const;

export type AiTask = (typeof AI_TASKS)[keyof typeof AI_TASKS];

export interface AiRequest<TOutput> {
  readonly task: AiTask;
  readonly purpose: Purpose;
  /** Versioned prompt held in source control, never assembled ad hoc at a call site. */
  readonly promptVersion: string;
  /**
   * Already redacted by the caller. The adapter refuses to transmit anything that still
   * looks sensitive, but redaction is the caller's responsibility, not a late safety net.
   */
  readonly input: Record<string, unknown>;
  /**
   * Validates the model's response. A result that fails validation is discarded and
   * reported as `INVALID_OUTPUT` — never coerced into something usable.
   */
  readonly validate: (candidate: unknown) => AiValidationResult<TOutput>;
  readonly responseSchemaVersion: string;
  /** Hard budget. On expiry the caller proceeds with deterministic rules. */
  readonly timeoutMs: number;
  readonly correlationId: string;
  readonly organizationId: string | null;
}

export type AiValidationResult<TOutput> =
  | { readonly ok: true; readonly value: TOutput }
  | { readonly ok: false; readonly problems: readonly string[] };

export const AI_RESULT_STATUSES = {
  OK: 'OK',
  /** The model answered, but the answer did not satisfy the response schema. */
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  TIMEOUT: 'TIMEOUT',
  /** The provider rejected the request or was unavailable. */
  ERROR: 'ERROR',
  /** Refused before transmission, for example because the input was not redacted. */
  BLOCKED: 'BLOCKED',
} as const;

export type AiResultStatus = (typeof AI_RESULT_STATUSES)[keyof typeof AI_RESULT_STATUSES];

/**
 * Metadata persisted for every call, whatever the outcome. Slide 071 requires prompt,
 * schema, and model versions to be tracked like ordinary application changes.
 */
export interface AiCallMetadata {
  readonly providerName: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly responseSchemaVersion: string;
  /** Digest of the redacted input, so a call is reproducible without storing the input. */
  readonly inputHash: string;
  readonly latencyMs: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

export type AiResult<TOutput> =
  | {
      readonly status: typeof AI_RESULT_STATUSES.OK;
      readonly value: TOutput;
      readonly metadata: AiCallMetadata;
    }
  | {
      readonly status: Exclude<AiResultStatus, typeof AI_RESULT_STATUSES.OK>;
      readonly problems: readonly string[];
      readonly metadata: AiCallMetadata;
    };

export interface AIProvider {
  readonly name: string;

  /**
   * Runs one bounded task. Never throws for a model-side failure: an unavailable or
   * misbehaving model is an expected condition that the deterministic path must survive,
   * so it is reported in the result instead.
   */
  execute<TOutput>(request: AiRequest<TOutput>): Promise<AiResult<TOutput>>;
}
