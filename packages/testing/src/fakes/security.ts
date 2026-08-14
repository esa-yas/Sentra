import { createHash, randomBytes } from 'node:crypto';
import type { PasswordHasher, SecureRandom } from '@sentra/ports';

const FAKE_HASH_PREFIX = '$fake$';

/**
 * Deterministic-enough randomness for tests. Production adapters must use a CSPRNG; this
 * fake uses `randomBytes` and is suitable only for tests and local development.
 */
export class FakeSecureRandom implements SecureRandom {
  public token(byteLength: number): string {
    return randomBytes(byteLength).toString('base64url');
  }

  public uuid(): string {
    return randomBytes(16).toString('hex');
  }
}

/**
 * Fast, non-Argon2 hasher for tests. Never use outside tests — it exists so the core can
 * exercise {@link PasswordHasher} without loading native modules.
 */
export class FakePasswordHasher implements PasswordHasher {
  public async hash(plaintext: string): Promise<string> {
    const digest = createHash('sha256').update(plaintext).digest('hex');
    return `${FAKE_HASH_PREFIX}${digest}`;
  }

  public async verify(plaintext: string, hash: string): Promise<boolean> {
    if (!hash.startsWith(FAKE_HASH_PREFIX)) {
      return false;
    }
    const expected = await this.hash(plaintext);
    return expected === hash;
  }

  public needsRehash(hash: string): boolean {
    return !hash.startsWith(FAKE_HASH_PREFIX);
  }
}

export const createFakeSecureRandom = (): FakeSecureRandom => new FakeSecureRandom();
export const createFakePasswordHasher = (): FakePasswordHasher => new FakePasswordHasher();
