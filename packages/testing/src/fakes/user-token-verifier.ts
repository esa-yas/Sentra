import { InvalidTokenError } from '@sentra/contracts';
import type { Clock, UserTokenVerifier, VerifiedUserToken } from '@sentra/ports';

export interface RegisteredUserToken {
  readonly rawToken: string;
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly algorithm: string;
  readonly email?: string;
  readonly notBeforeMs: number;
  readonly expiresAtMs: number;
  readonly assuranceLevel?: string;
  readonly active: boolean;
}

export interface FakeUserTokenVerifierOptions {
  readonly expectedIssuer?: string;
  readonly expectedAudience?: string;
  readonly allowedAlgorithms?: readonly string[];
}

/**
 * Verifies portal tokens against an in-memory registry for contract tests.
 */
export class FakeUserTokenVerifier implements UserTokenVerifier {
  private readonly expectedIssuer: string;
  private readonly expectedAudience: string;
  private readonly allowedAlgorithms: readonly string[];

  private readonly tokens = new Map<string, RegisteredUserToken>();

  public constructor(
    private readonly clock: Clock,
    options: FakeUserTokenVerifierOptions = {},
  ) {
    this.expectedIssuer = options.expectedIssuer ?? 'https://auth.sentra.test';
    this.expectedAudience = options.expectedAudience ?? 'sentra-portal';
    this.allowedAlgorithms = options.allowedAlgorithms ?? ['RS256'];
  }

  public registerToken(token: RegisteredUserToken): void {
    this.tokens.set(token.rawToken, token);
  }

  public rotateKey(rawToken: string, replacement: RegisteredUserToken): void {
    this.tokens.delete(rawToken);
    this.registerToken({ ...replacement, active: true });
  }

  public revoke(rawToken: string): void {
    const existing = this.tokens.get(rawToken);
    if (existing !== undefined) {
      this.tokens.set(rawToken, { ...existing, active: false });
    }
  }

  public async verify(rawToken: string): Promise<VerifiedUserToken> {
    const record = this.tokens.get(rawToken);
    if (record === undefined || !record.active) {
      throw new InvalidTokenError('The presented token is not valid.');
    }

    if (record.issuer !== this.expectedIssuer) {
      throw new InvalidTokenError('The presented token is not valid.');
    }
    if (record.audience !== this.expectedAudience) {
      throw new InvalidTokenError('The presented token is not valid.');
    }
    if (!this.allowedAlgorithms.includes(record.algorithm)) {
      throw new InvalidTokenError('The presented token is not valid.');
    }

    const nowMs = this.clock.now().getTime();
    if (nowMs < record.notBeforeMs) {
      throw new InvalidTokenError('The presented token is not valid.');
    }
    if (nowMs >= record.expiresAtMs) {
      throw new InvalidTokenError('The presented token is not valid.');
    }

    return {
      issuer: record.issuer,
      subject: record.subject,
      ...(record.email === undefined ? {} : { email: record.email }),
      expiresAt: new Date(record.expiresAtMs),
      ...(record.assuranceLevel === undefined ? {} : { assuranceLevel: record.assuranceLevel }),
    };
  }
}

export const createFakeUserTokenVerifier = (
  clock: Clock,
  options?: FakeUserTokenVerifierOptions,
): FakeUserTokenVerifier => new FakeUserTokenVerifier(clock, options);
