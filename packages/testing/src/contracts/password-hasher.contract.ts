import { describe, expect, it } from 'vitest';
import type { PasswordHasher } from '@sentra/ports';

export const describePasswordHasherContract = (
  name: string,
  factory: () => PasswordHasher,
): void => {
  describe(`${name} PasswordHasher`, () => {
    it('hashes a plaintext secret without returning it', async () => {
      const hasher = factory();
      const hash = await hasher.hash('correct-horse-battery-staple');

      expect(hash).not.toContain('correct-horse-battery-staple');
      expect(hash.length).toBeGreaterThan(16);
    });

    it('verifies a valid plaintext against its hash', async () => {
      const hasher = factory();
      const hash = await hasher.hash('partner-secret-value');

      await expect(hasher.verify('partner-secret-value', hash)).resolves.toBe(true);
    });

    it('rejects an invalid plaintext without throwing', async () => {
      const hasher = factory();
      const hash = await hasher.hash('partner-secret-value');

      await expect(hasher.verify('wrong-secret', hash)).resolves.toBe(false);
    });

    it('rejects malformed hashes without throwing', async () => {
      const hasher = factory();

      await expect(hasher.verify('anything', 'clearly-not-a-hash')).resolves.toBe(false);
    });

    it('reports when a stored hash needs rehashing', async () => {
      const hasher = factory();
      const hash = await hasher.hash('rotate-me');

      expect(hasher.needsRehash(hash)).toBe(false);
      expect(hasher.needsRehash('legacy-md5-looking-hash')).toBe(true);
    });
  });
};
