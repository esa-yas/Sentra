import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '@sentra/ports';

/**
 * Argon2id hasher for partner client secrets. Parameters are conservative development
 * defaults; `needsRehash` returns true for any non-Argon2id stored value so a later
 * parameter bump can rotate hashes on next successful authentication.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  public async hash(plaintext: string): Promise<string> {
    return hash(plaintext, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  public async verify(plaintext: string, stored: string): Promise<boolean> {
    try {
      return await verify(stored, plaintext);
    } catch {
      return false;
    }
  }

  public needsRehash(stored: string): boolean {
    return !stored.startsWith('$argon2id$');
  }
}

export const createArgon2PasswordHasher = (): Argon2PasswordHasher => new Argon2PasswordHasher();
