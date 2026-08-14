/**
 * Small ports that make the core deterministic and testable.
 *
 * Time and identity generation are injected rather than called directly, so a test can
 * assert on an exact expiry boundary or a stable identifier without waiting or guessing.
 */

/** Wall-clock access. The core never calls `Date.now()` directly. */
export interface Clock {
  now(): Date;
  /** Milliseconds since an arbitrary origin, for measuring elapsed time. */
  monotonicMs(): number;
}

/** ULID generation, kept behind a port so identifiers stay deterministic under test. */
export interface IdGenerator {
  generate(): string;
  /** Generates an identifier whose embedded timestamp matches the given instant. */
  generateAt(instant: Date): string;
}

/** Randomness for credentials and tokens. Must be cryptographically secure in production. */
export interface SecureRandom {
  /** URL-safe token of the requested byte length. */
  token(byteLength: number): string;
  uuid(): string;
}

/**
 * Password and secret hashing. Argon2id in production; the interface exists so the core
 * never depends on a native module and a test can substitute a fast implementation.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  /** Constant-time comparison. Returns false rather than throwing on a malformed hash. */
  verify(plaintext: string, hash: string): Promise<boolean>;
  /** True when a stored hash used weaker parameters and should be upgraded on next use. */
  needsRehash(hash: string): boolean;
}
