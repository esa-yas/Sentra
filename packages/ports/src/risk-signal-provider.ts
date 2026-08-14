/**
 * Read access to correlated telecom risk signals.
 *
 * This port exists in Milestone 1 with no production implementation, and that is
 * deliberate. Slide 035 requires the synchronous decision path to fail neutral, so the
 * shape of "no signal available" has to be designed before any decisioning depends on it.
 * Defining the port now also keeps the correlation module (Version 2) from inventing its own
 * interface against a live telecom feed.
 *
 * The core never reads a raw risk event through this port. It receives derived indicators
 * bound to a consented, pairwise subject reference (slide 002).
 */

export const RISK_INDICATOR_CODES = {
  /** A call was in progress when the payment was initiated. */
  ACTIVE_CALL_DURING_PAYMENT: 'ACTIVE_CALL_DURING_PAYMENT',
  /** The counterparty number was recently reported by another consented subscriber. */
  RECENTLY_REPORTED_NUMBER: 'RECENTLY_REPORTED_NUMBER',
  /** Call originated from a network path associated with spoofing. */
  SUSPECTED_SPOOFED_ORIGIN: 'SUSPECTED_SPOOFED_ORIGIN',
  /** Unusual volume of short calls to the subscriber, typical of a sweep campaign. */
  CAMPAIGN_PATTERN_MATCH: 'CAMPAIGN_PATTERN_MATCH',
  /** The subscriber's device changed SIM shortly before the payment. */
  RECENT_SIM_CHANGE: 'RECENT_SIM_CHANGE',
  /** Call forwarding was enabled recently, a common account-takeover precursor. */
  RECENT_CALL_FORWARDING_CHANGE: 'RECENT_CALL_FORWARDING_CHANGE',
} as const;

export type RiskIndicatorCode = (typeof RISK_INDICATOR_CODES)[keyof typeof RISK_INDICATOR_CODES];

export interface RiskIndicator {
  readonly code: RiskIndicatorCode;
  /** Provider confidence in this single indicator, from 0 to 1. */
  readonly confidence: number;
  /** When the underlying observation was made, not when it was read. */
  readonly observedAt: Date;
  /** Which telecom tenant supplied it, for provenance in the audit record. */
  readonly sourceOrganizationId: string;
  /** Identifier of the consent that permits this indicator to be used. */
  readonly consentId: string;
}

export interface RiskSignalQuery {
  /** Consented pairwise reference. Never a telephone number. */
  readonly subjectRef: string;
  readonly organizationId: string;
  /** How far back to look. Bounded so a query cannot become an unlimited history read. */
  readonly lookbackSeconds: number;
  /** Hard budget. On expiry the provider returns `UNAVAILABLE` rather than a partial answer. */
  readonly timeoutMs: number;
  readonly correlationId: string;
}

export const RISK_SIGNAL_STATUSES = {
  /** Signals were retrieved. The list may still be empty, which is a meaningful answer. */
  OK: 'OK',
  /** No consent covers this subject, so no lookup was attempted. */
  NO_CONSENT: 'NO_CONSENT',
  /**
   * The provider could not answer in time or at all. Distinct from an empty result: this
   * must never be read as "no risk", which is what makes the decision path fail neutral.
   */
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type RiskSignalStatus = (typeof RISK_SIGNAL_STATUSES)[keyof typeof RISK_SIGNAL_STATUSES];

export type RiskSignalResult =
  | {
      readonly status: typeof RISK_SIGNAL_STATUSES.OK;
      readonly indicators: readonly RiskIndicator[];
      readonly latencyMs: number;
    }
  | {
      readonly status: Exclude<RiskSignalStatus, typeof RISK_SIGNAL_STATUSES.OK>;
      readonly reason: string;
      readonly latencyMs: number;
    };

export interface RiskSignalProvider {
  readonly name: string;

  /**
   * Retrieves indicators for one subject. Never throws for an unavailable upstream: the
   * caller must be able to proceed to a neutral recommendation.
   */
  query(query: RiskSignalQuery): Promise<RiskSignalResult>;
}
