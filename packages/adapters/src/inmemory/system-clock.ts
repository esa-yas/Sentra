import { performance } from 'node:perf_hooks';
import type { Clock } from '@sentra/ports';

/**
 * The production-shaped wall clock. Uses the system time for `now()` and a monotonic
 * source for elapsed-time measurement, so timings are never distorted by a wall-clock
 * adjustment. Deterministic test doubles live in `@sentra/testing`; this is the real one.
 */
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public monotonicMs(): number {
    return performance.now();
  }
}

export const createSystemClock = (): SystemClock => new SystemClock();
