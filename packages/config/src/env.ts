import { z } from 'zod';

/**
 * The environment contract.
 *
 * Configuration is parsed exactly once, at boot, and the process refuses to start when it
 * is invalid. A misconfigured fraud-prevention service that starts and behaves subtly
 * wrongly is far more dangerous than one that fails loudly, so every constraint below is
 * a hard failure rather than a fallback.
 */

const postgresUrlSchema = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'Must be a postgresql:// connection string.',
  });

/** `.default` is applied before the transform so the fallback is the raw string form. */
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

/** Treats an unset or blank variable as absent, so `FOO=` behaves like omitting `FOO`. */
const optionalNonEmpty = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : value.trim()))
  .optional();

const pemSchema = optionalNonEmpty.refine(
  (value) => value === undefined || value.includes('-----BEGIN'),
  { message: 'Must be a PEM-encoded key. Escape newlines as \\n when setting it in an environment variable.' },
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().min(1).default('sentra'),
  SERVICE_VERSION: z.string().min(1).default('0.1.0'),
  /** Build commit, injected by CI/Railway. Surfaced read-only on the development screen. */
  SERVICE_COMMIT: optionalNonEmpty,
  /**
   * Which provider implementations the composition root wires. Version 1a ships only the
   * in-memory mode; `real` (Postgres/Redis/BullMQ) is enabled from Slice 2 onward.
   */
  SENTRA_PROVIDER_MODE: z.enum(['in-memory', 'real']).default('in-memory'),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(5_242_880).default(262_144),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  /** Number of proxy hops to trust for client address resolution. Railway terminates one. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  DATABASE_URL: postgresUrlSchema,
  /**
   * Direct, non-pooled connection. Prisma migrations take advisory locks and issue DDL,
   * neither of which behaves correctly through PgBouncer in transaction mode, so Supabase
   * requires a separate direct URL for schema changes.
   */
  DATABASE_DIRECT_URL: postgresUrlSchema,
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),

  REDIS_URL: z.string().min(1).refine((value) => /^rediss?:\/\//.test(value), {
    message: 'Must be a redis:// or rediss:// connection string.',
  }),

  SUPABASE_URL: optionalNonEmpty,
  SUPABASE_JWT_ISSUER: optionalNonEmpty,
  SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
  /** Legacy symmetric secret. When absent, tokens are verified against the project JWKS. */
  SUPABASE_JWT_SECRET: optionalNonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('sentra-evidence'),
  SUPABASE_JWKS_CACHE_SECONDS: z.coerce.number().int().min(30).max(86_400).default(600),

  PARTNER_TOKEN_ISSUER: z.string().min(1).default('https://api.sentra.local'),
  PARTNER_TOKEN_AUDIENCE: z.string().min(1).default('sentra-partner-api'),
  PARTNER_TOKEN_ACTIVE_KID: z.string().min(1).default('dev-partner-key-1'),
  PARTNER_TOKEN_PRIVATE_KEY_PEM: pemSchema,
  PARTNER_TOKEN_PUBLIC_KEY_PEM: pemSchema,
  PARTNER_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(300),
  /** Tolerance for clock skew when verifying a partner token. */
  PARTNER_TOKEN_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(120).default(5),

  DEFAULT_DEADLINE_MS: z.coerce.number().int().min(50).max(10_000).default(650),
  MAX_DEADLINE_MS: z.coerce.number().int().min(50).max(30_000).default(2_000),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3_600).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100_000).default(600),
  /** The token endpoint is a credential-guessing target, so it gets a tighter budget. */
  RATE_LIMIT_TOKEN_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(30),

  SENTRY_DSN: optionalNonEmpty,
  SENTRY_ENVIRONMENT: z.string().min(1).default('local'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(500),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  OUTBOX_CLAIM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(60_000),
  RETENTION_SWEEP_CRON: z.string().min(9).max(64).default('0 3 * * *'),
  RETENTION_SWEEP_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(500),

  /** Enables the audit chain verification endpoint's full-scan mode. */
  AUDIT_VERIFY_MAX_EVENTS: z.coerce.number().int().min(100).max(1_000_000).default(50_000),

  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).max(2_592_000).default(86_400),

  ENABLE_SWAGGER_UI: booleanFromString,
});

export type RawEnv = z.infer<typeof envSchema>;
