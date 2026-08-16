import { InvalidTokenError } from '@sentra/contracts';
import type { UserTokenVerifier, VerifiedUserToken } from '@sentra/ports';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/** The verifier only needs the wall-clock time, so it accepts any clock-shaped value. */
interface VerifierClock {
  now(): Date;
}

export interface SupabaseUserTokenVerifierOptions {
  readonly clock: VerifierClock;
  /** Expected `iss` claim. Omit only in tests that do not assert issuer binding. */
  readonly issuer?: string;
  /** Expected `aud` claim (Supabase defaults to "authenticated"). */
  readonly audience: string;
  /** Signing algorithms accepted before any key lookup; anything else is rejected. */
  readonly allowedAlgorithms: readonly string[];
  /** Tolerated clock skew when checking `exp`/`nbf`. Defaults to zero. */
  readonly clockToleranceSeconds?: number;
  /** Production: the project's published JWKS endpoint (asymmetric verification). */
  readonly jwksUrl?: string;
  readonly jwksCacheSeconds?: number;
  /** Legacy: symmetric verification against the project's JWT secret. */
  readonly sharedSecret?: string;
  /** Test seam: resolve keys locally instead of over the network. */
  readonly keyResolver?: JWTVerifyGetKey;
}

/**
 * Verifies a Supabase Auth JWT and resolves it to a small set of trusted claims.
 *
 * The token is verified against the project's published keys (or, for a legacy project, its
 * shared secret) rather than by calling Supabase on every request (slide 053). Issuer,
 * audience, algorithm, not-before, and expiry are all enforced; anything unverifiable throws
 * {@link InvalidTokenError}, whose message is never exposed to the caller, so a verification
 * failure cannot be used to probe why a token was rejected.
 */
export class SupabaseUserTokenVerifier implements UserTokenVerifier {
  private readonly key: Uint8Array | JWTVerifyGetKey;

  public constructor(private readonly options: SupabaseUserTokenVerifierOptions) {
    this.key = SupabaseUserTokenVerifier.resolveKey(options);
  }

  private static resolveKey(
    options: SupabaseUserTokenVerifierOptions,
  ): Uint8Array | JWTVerifyGetKey {
    if (options.keyResolver !== undefined) {
      return options.keyResolver;
    }
    if (options.jwksUrl !== undefined) {
      return createRemoteJWKSet(new URL(options.jwksUrl), {
        cacheMaxAge: (options.jwksCacheSeconds ?? 600) * 1_000,
      });
    }
    if (options.sharedSecret !== undefined) {
      return new TextEncoder().encode(options.sharedSecret);
    }
    throw new Error(
      'SupabaseUserTokenVerifier requires a JWKS URL, a shared secret, or a key resolver.',
    );
  }

  public async verify(rawToken: string): Promise<VerifiedUserToken> {
    if (typeof rawToken !== 'string' || rawToken.trim() === '') {
      throw new InvalidTokenError();
    }

    const verifyOptions = {
      algorithms: [...this.options.allowedAlgorithms],
      audience: this.options.audience,
      currentDate: this.options.clock.now(),
      clockTolerance: this.options.clockToleranceSeconds ?? 0,
      ...(this.options.issuer === undefined ? {} : { issuer: this.options.issuer }),
    };

    const key = this.key;
    try {
      const { payload } =
        typeof key === 'function'
          ? await jwtVerify(rawToken, key, verifyOptions)
          : await jwtVerify(rawToken, key, verifyOptions);
      return this.toVerifiedToken(payload);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      // jose throws a range of typed errors (expired, claim mismatch, bad signature, unknown
      // key). They all mean the same thing to the caller and must not leak detail.
      throw new InvalidTokenError();
    }
  }

  private toVerifiedToken(payload: JWTPayload): VerifiedUserToken {
    const subject = payload.sub;
    const issuer = payload.iss;
    const expiresAtSeconds = payload.exp;
    if (typeof subject !== 'string' || subject === '') {
      throw new InvalidTokenError();
    }
    if (typeof issuer !== 'string' || issuer === '') {
      throw new InvalidTokenError();
    }
    if (typeof expiresAtSeconds !== 'number') {
      throw new InvalidTokenError();
    }

    const email = typeof payload['email'] === 'string' ? (payload['email'] as string) : undefined;
    const assuranceLevel =
      typeof payload['aal'] === 'string' ? (payload['aal'] as string) : undefined;

    return {
      issuer,
      subject,
      expiresAt: new Date(expiresAtSeconds * 1_000),
      ...(email === undefined ? {} : { email }),
      ...(assuranceLevel === undefined ? {} : { assuranceLevel }),
    };
  }
}

export const createSupabaseUserTokenVerifier = (
  options: SupabaseUserTokenVerifierOptions,
): SupabaseUserTokenVerifier => new SupabaseUserTokenVerifier(options);
