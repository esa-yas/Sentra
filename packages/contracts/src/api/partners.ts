import { z } from 'zod';
import { partnerScopeSchema } from '../authorization';
import { purposeSchema } from '../purpose';
import { ulidSchema } from '../identifiers';

export const PARTNER_CONNECTION_KINDS = {
  /** A bank submitting payment intents and outcomes. */
  BANK_API: 'BANK_API',
  /** A telecom submitting signed scam risk events. */
  TELECOM_EVENTS: 'TELECOM_EVENTS',
} as const;

export type PartnerConnectionKind =
  (typeof PARTNER_CONNECTION_KINDS)[keyof typeof PARTNER_CONNECTION_KINDS];

export const partnerConnectionKindSchema = z.enum([
  PARTNER_CONNECTION_KINDS.BANK_API,
  PARTNER_CONNECTION_KINDS.TELECOM_EVENTS,
]);

export const PARTNER_CONNECTION_STATUSES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const;

export type PartnerConnectionStatus =
  (typeof PARTNER_CONNECTION_STATUSES)[keyof typeof PARTNER_CONNECTION_STATUSES];

export const partnerConnectionStatusSchema = z.enum([
  PARTNER_CONNECTION_STATUSES.ACTIVE,
  PARTNER_CONNECTION_STATUSES.SUSPENDED,
  PARTNER_CONNECTION_STATUSES.REVOKED,
]);

/** CIDR or bare address. Empty list means no network restriction is configured. */
const ipAllowlistEntrySchema = z
  .string()
  .max(43)
  .regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, 'Must be an IPv4 or IPv6 address, optionally with a prefix length.');

export const createPartnerConnectionRequestSchema = z
  .object({
    name: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9 _-]*$/i, 'Must be a short readable label.'),
    kind: partnerConnectionKindSchema,
    scopes: z.array(partnerScopeSchema).min(1).max(8),
    allowedPurposes: z.array(purposeSchema).min(1).max(4),
    ipAllowlist: z.array(ipAllowlistEntrySchema).max(32).default([]),
    tokenTtlSeconds: z.number().int().min(60).max(3600).default(300),
  })
  .strict();

export type CreatePartnerConnectionRequest = z.infer<typeof createPartnerConnectionRequestSchema>;

export const partnerConnectionResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema,
  name: z.string(),
  kind: partnerConnectionKindSchema,
  clientId: z.string(),
  scopes: z.array(partnerScopeSchema),
  allowedPurposes: z.array(purposeSchema),
  ipAllowlist: z.array(z.string()),
  tokenTtlSeconds: z.number().int(),
  status: partnerConnectionStatusSchema,
  lastRotatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type PartnerConnectionResponse = z.infer<typeof partnerConnectionResponseSchema>;

/**
 * The plaintext secret is returned exactly once, at creation or rotation. It is stored
 * only as an Argon2id hash, so a lost secret must be rotated rather than recovered.
 */
export const partnerCredentialResponseSchema = z.object({
  connection: partnerConnectionResponseSchema,
  clientId: z.string(),
  clientSecret: z.string(),
  warning: z.literal('This secret is shown once and cannot be retrieved again. Store it in a secret manager.'),
});

export type PartnerCredentialResponse = z.infer<typeof partnerCredentialResponseSchema>;

export const SIGNING_KEY_STATUSES = {
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
  REVOKED: 'REVOKED',
} as const;

export type SigningKeyStatus = (typeof SIGNING_KEY_STATUSES)[keyof typeof SIGNING_KEY_STATUSES];

export const signingKeyStatusSchema = z.enum([
  SIGNING_KEY_STATUSES.ACTIVE,
  SIGNING_KEY_STATUSES.RETIRED,
  SIGNING_KEY_STATUSES.REVOKED,
]);

/**
 * A partner registers the public half of the key it signs risk events with. Slide 013
 * requires signature, replay window, and tenant to be verified before ingest; this
 * registry is what makes the signature check possible, and the validity window is what
 * makes key rotation auditable.
 */
export const registerSigningKeyRequestSchema = z
  .object({
    kid: z.string().min(4).max(64).regex(/^[A-Za-z0-9._-]+$/, 'Must be a URL-safe key identifier.'),
    algorithm: z.enum(['ES256', 'ES384', 'EdDSA']),
    /** Public key in JWK form. A private key component is rejected. */
    publicKeyJwk: z.record(z.unknown()),
    notBefore: z.string().datetime().optional(),
    notAfter: z.string().datetime().optional(),
  })
  .strict()
  .refine((value) => !('d' in value.publicKeyJwk), {
    message: 'The JWK must not contain a private key component.',
    path: ['publicKeyJwk'],
  });

export type RegisterSigningKeyRequest = z.infer<typeof registerSigningKeyRequestSchema>;

export const signingKeyResponseSchema = z.object({
  id: ulidSchema,
  partnerConnectionId: ulidSchema,
  kid: z.string(),
  algorithm: z.string(),
  status: signingKeyStatusSchema,
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type SigningKeyResponse = z.infer<typeof signingKeyResponseSchema>;
