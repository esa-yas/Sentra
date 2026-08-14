import type { PartnerScope, Purpose, RequestPrincipal } from '@sentra/contracts';

/**
 * Authentication ports.
 *
 * Two paths lead to the same {@link RequestPrincipal}: a Supabase JWT for a person, and an
 * OAuth2 client-credentials token for a partner machine client. Both are verified here so
 * the rest of the application authorizes against one shape (slide 073).
 *
 * Verification is asymmetric wherever possible. Slide 053 warns against coupling to a
 * provider's session model, so a token is verified against published keys rather than by
 * calling the provider on every request.
 */

/** Claims trusted after a portal token has been verified. */
export interface VerifiedUserToken {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly expiresAt: Date;
  /** Present when the provider reports a multi-factor assurance level. */
  readonly assuranceLevel?: string;
}

export interface UserTokenVerifier {
  /** Rejects an expired, mis-audienced, or unverifiable token by throwing. */
  verify(rawToken: string): Promise<VerifiedUserToken>;
}

export interface IssuePartnerTokenInput {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Empty means every scope the connection holds. */
  readonly requestedScopes: readonly PartnerScope[];
  readonly requestedPurpose?: Purpose;
  /** Checked against the connection's allowlist when one is configured. */
  readonly clientIp?: string;
  readonly correlationId: string;
}

export interface IssuedPartnerToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly grantedScopes: readonly PartnerScope[];
  readonly tokenId: string;
  readonly organizationId: string;
  readonly partnerConnectionId: string;
}

export interface PartnerAuthProvider {
  /**
   * Validates client credentials and mints a short-lived access token.
   *
   * Throws for an unknown client, a bad secret, a disallowed scope, or a blocked address —
   * always with the same error, so the endpoint cannot be used to enumerate clients.
   */
  issueToken(input: IssuePartnerTokenInput): Promise<IssuedPartnerToken>;

  /** Verifies a presented token and resolves it to a principal. */
  verifyToken(rawToken: string): Promise<RequestPrincipal>;

  /** Public keys for partners that wish to verify our tokens independently. */
  publicJwks(): Promise<{ keys: readonly Record<string, unknown>[] }>;
}

/**
 * Detached-signature verification for inbound telecom risk events.
 *
 * Slide 013 requires the signature, the replay window, and the tenant to all be checked
 * before an event is accepted. Returning a structured reason rather than throwing lets the
 * ingest path record precisely why an event was refused.
 */
export interface SignatureVerificationInput {
  readonly organizationId: string;
  readonly keyId: string;
  /** Exact bytes that were signed, before any parsing. */
  readonly payload: Uint8Array;
  readonly signature: string;
  /** Signing time as claimed by the partner, used for the replay window. */
  readonly signedAt: Date;
}

export const SIGNATURE_FAILURE_REASONS = {
  UNKNOWN_KEY: 'UNKNOWN_KEY',
  KEY_NOT_ACTIVE: 'KEY_NOT_ACTIVE',
  KEY_OUTSIDE_VALIDITY_WINDOW: 'KEY_OUTSIDE_VALIDITY_WINDOW',
  // The key belongs to a different tenant than the one submitting the event.
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  // Signed too long ago, or dated in the future beyond the tolerated skew.
  OUTSIDE_REPLAY_WINDOW: 'OUTSIDE_REPLAY_WINDOW',
} as const;

export type SignatureFailureReason =
  (typeof SIGNATURE_FAILURE_REASONS)[keyof typeof SIGNATURE_FAILURE_REASONS];

export type SignatureVerificationResult =
  | { readonly valid: true; readonly keyId: string; readonly algorithm: string }
  | { readonly valid: false; readonly reason: SignatureFailureReason };

export interface SignatureVerifier {
  verify(input: SignatureVerificationInput): Promise<SignatureVerificationResult>;
}
