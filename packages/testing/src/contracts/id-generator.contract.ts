import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '@sentra/ports';

export const describeIdGeneratorContract = (name: string, factory: () => IdGenerator): void => {
  describe(`${name} IdGenerator`, () => {
    it('returns unique identifiers on successive calls', () => {
      const ids = factory();
      const first = ids.generate();
      const second = ids.generate();
      expect(first).not.toBe(second);
    });

    it('generates identifiers deterministically at a supplied instant', () => {
      const ids = factory();
      const instant = new Date('2026-01-15T10:00:00.000Z');
      const atInstant = ids.generateAt(instant);
      expect(atInstant.length).toBeGreaterThan(10);
    });

    it('does not reuse an identifier within the same generator instance', () => {
      const ids = factory();
      const seen = new Set<string>();
      for (let index = 0; index < 20; index += 1) {
        const value = ids.generate();
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
    });
  });
};
