import {
  PROTECTION_VERDICTS,
  type ProtectionSessionRequest,
  type ProtectionSessionResponse,
  type ProtectionVerdict,
  type ResolveSessionRequest,
  type ResolveSessionResponse,
  type SessionOutcome,
  type SubmitAnswersRequest,
  type SubmitAnswersResponse,
} from '@sentra/contracts';

/**
 * The Sentra bank SDK.
 *
 * A bank embeds this at its transfer-confirmation screen. The three calls mirror what actually
 * happens to a payment: it is checked, the customer may be asked a couple of questions, and the
 * bank reports how it ended.
 *
 * The SDK deliberately holds no product logic. It does not decide what is risky, choose which
 * questions to ask, or write a single word of what the customer reads — all of that comes back
 * from the engine, so the wording, the thresholds and the questions improve for every bank at
 * once without any of them shipping an app release. Everything here is transport and types.
 *
 * ```ts
 * const sentra = createSentraClient({ apiKey: process.env.SENTRA_KEY!, baseUrl: 'https://api.sentra.io' });
 * const session = await sentra.openSession({ subjectRef, amount: 8400, currency: 'GBP', firstTimePayee: true });
 * if (session.verdict !== 'PROCEED') { render(session.display, session.questions); }
 * ```
 */

export interface SentraClientOptions {
  /** A secret key (`sk_test_…` / `sk_live_…`). Server-side only — never ship one in an app bundle. */
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Milliseconds before a request is abandoned. Defaults to 4s: a payment screen cannot hang. */
  readonly timeoutMs?: number;
  /** Injectable for tests and for runtimes with a non-global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Thrown when the API answers with an error. `code` is stable; `message` is human-readable. */
export class SentraApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId: string | null,
  ) {
    super(message);
    this.name = 'SentraApiError';
  }
}

/** Thrown when the API could not be reached in time. Callers should fail open — see below. */
export class SentraUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SentraUnavailableError';
  }
}

const DEFAULT_TIMEOUT_MS = 4_000;

export interface SentraClient {
  /** Opens a session for a payment the customer is about to confirm. */
  openSession(input: ProtectionSessionRequest): Promise<ProtectionSessionResponse>;
  /** Sends the customer's answers back for the engine to interpret. */
  submitAnswers(sessionId: string, input: SubmitAnswersRequest): Promise<SubmitAnswersResponse>;
  /** Reports how the payment ended. This is what the engine learns from — always call it. */
  resolveSession(sessionId: string, input: ResolveSessionRequest): Promise<ResolveSessionResponse>;
}

export const createSentraClient = (options: SentraClientOptions): SentraClient => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = options.baseUrl.replace(/\/$/, '');

  const request = async <T>(path: string, body: unknown): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new SentraUnavailableError(
        error instanceof Error && error.name === 'AbortError'
          ? `Sentra did not respond within ${timeoutMs}ms.`
          : 'Sentra could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }

    const correlationId = response.headers.get('x-correlation-id');
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope =
        payload !== null && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: { code?: string; message?: string } }).error
          : undefined;
      throw new SentraApiError(
        response.status,
        envelope?.code ?? 'unknown',
        envelope?.message ?? response.statusText,
        correlationId,
      );
    }
    return payload as T;
  };

  return {
    openSession: (input) => request('/v1/protection-sessions', input),
    submitAnswers: (sessionId, input) =>
      request(`/v1/protection-sessions/${encodeURIComponent(sessionId)}/answers`, input),
    resolveSession: (sessionId, input) =>
      request(`/v1/protection-sessions/${encodeURIComponent(sessionId)}/resolve`, input),
  };
};

/**
 * Whether the confirmation screen should interrupt the customer.
 *
 * A tiny helper so the integrating app never has to hard-code verdict strings — which is exactly
 * the kind of logic that goes stale in a shipped app.
 */
export const shouldInterrupt = (verdict: ProtectionVerdict): boolean =>
  verdict !== PROTECTION_VERDICTS.PROCEED;

/** Whether the bank should stop the payment and route it for review. */
export const shouldHold = (verdict: ProtectionVerdict): boolean =>
  verdict === PROTECTION_VERDICTS.HOLD;

/**
 * Runs a session and fails **open** if Sentra is unreachable.
 *
 * A scam check must never become a reason a legitimate payment cannot be made: if the network is
 * down or slow, the payment proceeds as it would have without Sentra at all. Returns null when
 * the check could not run, which the caller should treat as "no advice", not as "safe".
 */
export const openSessionOrProceed = async (
  client: SentraClient,
  input: ProtectionSessionRequest,
): Promise<ProtectionSessionResponse | null> => {
  try {
    return await client.openSession(input);
  } catch (error) {
    if (error instanceof SentraUnavailableError) {
      return null;
    }
    throw error;
  }
};

export {
  PROTECTION_VERDICTS,
  type ProtectionSessionRequest,
  type ProtectionSessionResponse,
  type ProtectionVerdict,
  type ResolveSessionRequest,
  type ResolveSessionResponse,
  type SessionOutcome,
  type SubmitAnswersRequest,
  type SubmitAnswersResponse,
};
