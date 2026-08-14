import type {
  RiskIndicator,
  RiskSignalProvider,
  RiskSignalQuery,
  RiskSignalResult,
} from '@sentra/ports';
import { RISK_SIGNAL_STATUSES } from '@sentra/ports';
import type { Clock } from '@sentra/ports';

export interface FakeRiskSignalProviderOptions {
  readonly latencyMs?: number;
  readonly unavailable?: boolean;
  readonly unavailableReason?: string;
}

/**
 * Configurable risk-signal source that keeps `UNAVAILABLE`, `NO_CONSENT`, and an empty
 * `OK` result distinct — conflating them would break fail-neutral decisioning.
 */
export class FakeRiskSignalProvider implements RiskSignalProvider {
  public readonly name = 'fake-risk-signals';

  private readonly consentedSubjects = new Set<string>();
  private readonly indicatorsBySubject = new Map<string, RiskIndicator[]>();
  private unavailable = false;
  private unavailableReason = 'upstream timeout';
  private readonly latencyMs: number;

  public constructor(
    private readonly clock: Clock,
    options: FakeRiskSignalProviderOptions = {},
  ) {
    this.unavailable = options.unavailable ?? false;
    this.unavailableReason = options.unavailableReason ?? 'upstream timeout';
    this.latencyMs = options.latencyMs ?? 5;
  }

  public grantConsent(subjectRef: string): void {
    this.consentedSubjects.add(subjectRef);
  }

  public revokeConsent(subjectRef: string): void {
    this.consentedSubjects.delete(subjectRef);
  }

  public setIndicators(subjectRef: string, indicators: readonly RiskIndicator[]): void {
    this.indicatorsBySubject.set(subjectRef, [...indicators]);
  }

  public setUnavailable(unavailable: boolean, reason = 'upstream timeout'): void {
    this.unavailable = unavailable;
    this.unavailableReason = reason;
  }

  public async query(query: RiskSignalQuery): Promise<RiskSignalResult> {
    if (query.timeoutMs <= 0) {
      return {
        status: RISK_SIGNAL_STATUSES.UNAVAILABLE,
        reason: 'deadline exceeded before lookup',
        latencyMs: 0,
      };
    }

    if (this.unavailable) {
      return {
        status: RISK_SIGNAL_STATUSES.UNAVAILABLE,
        reason: this.unavailableReason,
        latencyMs: this.latencyMs,
      };
    }

    if (!this.consentedSubjects.has(query.subjectRef)) {
      return {
        status: RISK_SIGNAL_STATUSES.NO_CONSENT,
        reason: 'no consent covers this subject reference',
        latencyMs: this.latencyMs,
      };
    }

    const indicators = this.indicatorsBySubject.get(query.subjectRef) ?? [];
    const cutoff = this.clock.now().getTime() - query.lookbackSeconds * 1000;
    const withinWindow = indicators.filter((indicator) => indicator.observedAt.getTime() >= cutoff);

    return {
      status: RISK_SIGNAL_STATUSES.OK,
      indicators: withinWindow,
      latencyMs: this.latencyMs,
    };
  }
}

export const createFakeRiskSignalProvider = (
  clock: Clock,
  options?: FakeRiskSignalProviderOptions,
): FakeRiskSignalProvider => new FakeRiskSignalProvider(clock, options);
