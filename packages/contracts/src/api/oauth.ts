import { z } from 'zod';
import { partnerScopeSchema } from '../authorization';
import { purposeSchema } from '../purpose';

/**
 * OAuth2 client credentials, per RFC 6749 section 4.4.
 *
 * Slide 030 calls for OAuth2, signed JWTs, and mTLS at the partner edge. Railway cannot
 * terminate mTLS, so the pilot uses client credentials plus a detached JWS on telecom
 * events; mTLS is added later at a load balancer without changing this contract.
 *
 * Credentials are accepted in the body rather than only via Basic authentication so that
 * a partner's existing HTTP client needs no special encoding step. Both are supported.
 */
export const tokenRequestSchema = z
  .object({
    grant_type: z.literal('client_credentials'),
    client_id: z.string().min(8).max(128).optional(),
    client_secret: z.string().min(32).max(256).optional(),
    /** Space-delimited, per the RFC. Omitted means "every scope this client holds". */
    scope: z.string().max(512).optional(),
    /** Narrows the token to a single purpose when the connection permits several. */
    purpose: purposeSchema.optional(),
  })
  .strict();

export type TokenRequest = z.infer<typeof tokenRequestSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/** RFC 6749 section 5.2 error response. Deliberately terse: it must not aid enumeration. */
export const tokenErrorResponseSchema = z.object({
  error: z.enum(['invalid_request', 'invalid_client', 'invalid_scope', 'unauthorized_client', 'unsupported_grant_type']),
  error_description: z.string().optional(),
});

export type TokenErrorResponse = z.infer<typeof tokenErrorResponseSchema>;

/** Claims carried by an issued partner access token. */
export const partnerTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  jti: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
  /** Tenant the token is bound to. A partner token is never multi-tenant. */
  org: z.string(),
  org_type: z.enum(['BANK', 'TELECOM', 'PLATFORM']),
  scope: z.string(),
  purposes: z.array(purposeSchema).min(1),
});

export type PartnerTokenClaims = z.infer<typeof partnerTokenClaimsSchema>;

export const parseScopeString = (scope: string | undefined): readonly string[] =>
  scope === undefined ? [] : scope.split(' ').filter((entry) => entry.length > 0);

export const formatScopeString = (scopes: readonly string[]): string => scopes.join(' ');

export const partnerScopeListSchema = z.array(partnerScopeSchema);
