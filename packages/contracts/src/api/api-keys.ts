import { z } from 'zod';
import { ulidSchema } from '../identifiers';

/**
 * Developer API keys.
 *
 * Each key is a pair: a public publishable key (`pk_test_…` / `pk_live_…`) that identifies the
 * caller and may be embedded, and a secret key (`sk_test_…` / `sk_live_…`) shown exactly once at
 * creation — the server stores only its Argon2id hash. TEST keys are self-service; LIVE keys are
 * issued only to an APPROVED organization and are the only ones that reach the live network.
 */
export const API_KEY_ENVIRONMENTS = {
  TEST: 'TEST',
  LIVE: 'LIVE',
} as const;

export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[keyof typeof API_KEY_ENVIRONMENTS];

export const apiKeyEnvironmentSchema = z.enum([API_KEY_ENVIRONMENTS.TEST, API_KEY_ENVIRONMENTS.LIVE]);

export const API_KEY_STATUSES = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;

export type ApiKeyStatus = (typeof API_KEY_STATUSES)[keyof typeof API_KEY_STATUSES];

export const apiKeyStatusSchema = z.enum([API_KEY_STATUSES.ACTIVE, API_KEY_STATUSES.REVOKED]);

export const createApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    environment: apiKeyEnvironmentSchema.default(API_KEY_ENVIRONMENTS.TEST),
  })
  .strict();

export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

/** The safe, listable view of a key. Never carries the secret — only its last four characters. */
export const apiKeyViewSchema = z.object({
  id: ulidSchema,
  name: z.string(),
  environment: apiKeyEnvironmentSchema,
  publishableKey: z.string(),
  secretLast4: z.string().length(4),
  status: apiKeyStatusSchema,
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export type ApiKeyView = z.infer<typeof apiKeyViewSchema>;

/** Returned once, at creation: the full secret key plus a store-it-now warning. */
export const apiKeyCreatedResponseSchema = z.object({
  key: apiKeyViewSchema,
  secretKey: z.string(),
  warning: z.string(),
});

export type ApiKeyCreatedResponse = z.infer<typeof apiKeyCreatedResponseSchema>;

export const apiKeyListResponseSchema = z.object({
  items: z.array(apiKeyViewSchema),
  /** Whether this organization may currently mint LIVE keys (i.e. it is APPROVED). */
  canIssueLive: z.boolean(),
});

export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;
