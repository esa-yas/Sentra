import { describe, expect, it } from 'vitest';
import type { SecureRandom } from '@sentra/ports';

export const describeSecureRandomContract = (name: string, factory: () => SecureRandom): void => {
  describe(`${name} SecureRandom`, () => {
    it('returns a token with at least the requested byte length', () => {
      const random = factory();
      const token = random.token(24);

      expect(token.length).toBeGreaterThan(0);
      expect(Buffer.from(token, 'base64url').byteLength).toBeGreaterThanOrEqual(24);
    });

    it('does not repeat tokens in immediate succession', () => {
      const random = factory();
      const first = random.token(16);
      const second = random.token(16);

      expect(first).not.toBe(second);
    });

    it('returns distinct UUID-like values', () => {
      const random = factory();
      const first = random.uuid();
      const second = random.uuid();

      expect(first).not.toBe(second);
      expect(first.length).toBeGreaterThan(10);
    });
  });
};
