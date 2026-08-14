import type { Clock } from '@sentra/ports';

export interface FakeClockOptions {
  readonly startAt?: Date;
  readonly startMonotonicMs?: number;
}

/**
 * Deterministic clock for tests. Time advances only when {@link advance} or
 * {@link setNow} is called, so expiry boundaries are exact rather than flaky.
 */
export class FakeClock implements Clock {
  private current: Date;
  private monotonic: number;

  public constructor(options: FakeClockOptions = {}) {
    this.current = options.startAt ?? new Date('2026-08-11T12:00:00.000Z');
    this.monotonic = options.startMonotonicMs ?? 0;
  }

  public now(): Date {
    return new Date(this.current);
  }

  public monotonicMs(): number {
    return this.monotonic;
  }

  /** Moves wall time forward without touching the monotonic counter. */
  public setNow(instant: Date): void {
    this.current = new Date(instant);
  }

  public advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
    this.monotonic += ms;
  }
}

export const createFakeClock = (options?: FakeClockOptions): FakeClock => new FakeClock(options);
