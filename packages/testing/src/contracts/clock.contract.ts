import { describe, expect, it } from 'vitest';
import type { Clock } from '@sentra/ports';

export const describeClockContract = (name: string, factory: () => Clock & { advance?: (ms: number) => void }): void => {
  describe(`${name} Clock`, () => {
    it('returns the same instant until time is advanced', () => {
      const clock = factory();
      const first = clock.now();
      const second = clock.now();
      expect(second.getTime()).toBe(first.getTime());
    });

    it('exposes a monotonic counter that does not go backwards', () => {
      const clock = factory();
      const first = clock.monotonicMs();
      clock.advance?.(10);
      const second = clock.monotonicMs();
      expect(second).toBeGreaterThanOrEqual(first);
    });

    it('returns a fresh Date instance on each call', () => {
      const clock = factory();
      const first = clock.now();
      const second = clock.now();
      expect(first).not.toBe(second);
      expect(second.getTime()).toBe(first.getTime());
    });
  });
};
