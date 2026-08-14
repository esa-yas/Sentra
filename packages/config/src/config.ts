import { ValidationError } from '@sentra/contracts';
import { loadDotEnvFile } from './dotenv';
import { envSchema, type RawEnv } from './env';

/**
 * The typed configuration the rest of the application receives. Grouping by concern keeps
 * a dependency from reaching into unrelated settings: the queue adapter is handed
 * `config.redis`, never the whole environment.
 */
export interface AppConfig {
  readonly runtime: {
    readonly nodeEnv: 'development' | 'test' | 'production';
    readonly isProduction: boolean;
    readonly logLevel: RawEnv['LOG_LEVEL'];
    readonly serviceName: string;
    readonly serviceVersion: string;
    readonly serviceCommit: string;
    readonly providerMode: 'in-memory' | 'real';
  };
  readonly api: {
    readonly port: number;
    readonly bodyLimitBytes: number;
    readonly corsAllowedOrigins: readonly string[];
    readonly trustProxyHops: number;
    readonly enableSwaggerUi: boolean;
  };
  readonly database: {
    /** Pooled connection used at runtime. */
    readonly url: string;
    /** Direct connection used for migrations and advisory-lock work. */
    readonly directUrl: string;
    readonly poolSize: number;
    readonly statementTimeoutMs: number;
  };
  readonly redis: {
    readonly url: string;
  };
  readonly supabase: {
    readonly url?: string;
    readonly jwtIssuer?: string;
    readonly jwtAudience: string;
    readonly jwtSecret?: string;
    readonly serviceRoleKey?: string;
    readonly storageBucket: string;
    readonly jwksCacheSeconds: number;
    /** Derived: where to fetch the project's public verification keys. */
    readonly jwksUrl?: string;
  };
  readonly partnerAuth: {
    readonly issuer: string;
    readonly audience: string;
    readonly activeKid: string;
    readonly privateKeyPem?: string;
    readonly publicKeyPem?: string;
    readonly tokenTtlSeconds: number;
    readonly clockToleranceSeconds: number;
  };
  readonly decision: {
    readonly defaultDeadlineMs: number;
    readonly maxDeadlineMs: number;
  };
  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly maxRequests: number;
    readonly tokenEndpointMaxRequests: number;
  };
  readonly sentry: {
    readonly dsn?: string;
    readonly environment: string;
    readonly tracesSampleRate: number;
  };
  readonly worker: {
    readonly outboxPollIntervalMs: number;
    readonly outboxBatchSize: number;
    readonly outboxMaxAttempts: number;
    readonly outboxClaimTimeoutMs: number;
    readonly retentionSweepCron: string;
    readonly retentionSweepBatchSize: number;
  };
  readonly limits: {
    readonly auditVerifyMaxEvents: number;
    readonly idempotencyTtlSeconds: number;
  };
}

const parseOriginList = (value: string): readonly string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const deriveJwksUrl = (supabaseUrl: string | undefined): string | undefined =>
  supabaseUrl === undefined ? undefined : `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;

/**
 * Cross-field rules that a per-variable schema cannot express. These are the settings
 * where a plausible-looking value would still be wrong.
 */
const collectSemanticProblems = (env: RawEnv): readonly string[] => {
  const problems: string[] = [];

  if (env.MAX_DEADLINE_MS < env.DEFAULT_DEADLINE_MS) {
    problems.push('MAX_DEADLINE_MS must be greater than or equal to DEFAULT_DEADLINE_MS.');
  }

  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    // Portal sign-in cannot work without a verifiable issuer, and falling back to
    // "accept any token" would be catastrophic, so production refuses to boot without it.
    if (env.SUPABASE_URL === undefined && env.SUPABASE_JWT_SECRET === undefined) {
      problems.push(
        'Production requires SUPABASE_URL (for JWKS verification) or SUPABASE_JWT_SECRET (for legacy symmetric verification).',
      );
    }

    if (env.PARTNER_TOKEN_PRIVATE_KEY_PEM === undefined || env.PARTNER_TOKEN_PUBLIC_KEY_PEM === undefined) {
      problems.push(
        'Production requires PARTNER_TOKEN_PRIVATE_KEY_PEM and PARTNER_TOKEN_PUBLIC_KEY_PEM so partner tokens are asymmetrically signed.',
      );
    }

    if (env.PARTNER_TOKEN_ISSUER.startsWith('http://')) {
      problems.push('PARTNER_TOKEN_ISSUER must use https in production.');
    }

    if (env.CORS_ALLOWED_ORIGINS.includes('*')) {
      problems.push('CORS_ALLOWED_ORIGINS must name explicit origins in production; a wildcard is not permitted.');
    }

    for (const origin of parseOriginList(env.CORS_ALLOWED_ORIGINS)) {
      if (origin.startsWith('http://') && !origin.startsWith('http://localhost')) {
        problems.push(`CORS origin ${origin} must use https in production.`);
      }
    }

    if (!env.DATABASE_URL.includes('sslmode=') && !env.DATABASE_URL.includes('ssl=')) {
      problems.push('DATABASE_URL must request TLS in production, for example by appending ?sslmode=require.');
    }
  }

  return problems;
};

/**
 * Parses and validates the environment. Throws {@link ValidationError} listing every
 * problem at once, because discovering misconfiguration one variable per restart is a
 * poor deployment experience.
 */
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const fieldProblems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new ValidationError('The environment configuration is invalid.', { problems: fieldProblems });
  }

  const env = parsed.data;
  const semanticProblems = collectSemanticProblems(env);
  if (semanticProblems.length > 0) {
    throw new ValidationError('The environment configuration is invalid.', { problems: [...semanticProblems] });
  }

  const config: AppConfig = {
    runtime: {
      nodeEnv: env.NODE_ENV,
      isProduction: env.NODE_ENV === 'production',
      logLevel: env.LOG_LEVEL,
      serviceName: env.SERVICE_NAME,
      serviceVersion: env.SERVICE_VERSION,
      serviceCommit: env.SERVICE_COMMIT ?? 'unknown',
      providerMode: env.SENTRA_PROVIDER_MODE,
    },
    api: {
      port: env.API_PORT,
      bodyLimitBytes: env.API_BODY_LIMIT_BYTES,
      corsAllowedOrigins: parseOriginList(env.CORS_ALLOWED_ORIGINS),
      trustProxyHops: env.TRUST_PROXY_HOPS,
      enableSwaggerUi: env.ENABLE_SWAGGER_UI,
    },
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DATABASE_DIRECT_URL,
      poolSize: env.DATABASE_POOL_SIZE,
      statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
    },
    redis: { url: env.REDIS_URL },
    supabase: {
      ...(env.SUPABASE_URL === undefined ? {} : { url: env.SUPABASE_URL }),
      ...(env.SUPABASE_JWT_ISSUER === undefined ? {} : { jwtIssuer: env.SUPABASE_JWT_ISSUER }),
      jwtAudience: env.SUPABASE_JWT_AUDIENCE,
      ...(env.SUPABASE_JWT_SECRET === undefined ? {} : { jwtSecret: env.SUPABASE_JWT_SECRET }),
      ...(env.SUPABASE_SERVICE_ROLE_KEY === undefined ? {} : { serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
      storageBucket: env.SUPABASE_STORAGE_BUCKET,
      jwksCacheSeconds: env.SUPABASE_JWKS_CACHE_SECONDS,
      ...(deriveJwksUrl(env.SUPABASE_URL) === undefined ? {} : { jwksUrl: deriveJwksUrl(env.SUPABASE_URL) }),
    },
    partnerAuth: {
      issuer: env.PARTNER_TOKEN_ISSUER,
      audience: env.PARTNER_TOKEN_AUDIENCE,
      activeKid: env.PARTNER_TOKEN_ACTIVE_KID,
      ...(env.PARTNER_TOKEN_PRIVATE_KEY_PEM === undefined
        ? {}
        : { privateKeyPem: normalizePem(env.PARTNER_TOKEN_PRIVATE_KEY_PEM) }),
      ...(env.PARTNER_TOKEN_PUBLIC_KEY_PEM === undefined
        ? {}
        : { publicKeyPem: normalizePem(env.PARTNER_TOKEN_PUBLIC_KEY_PEM) }),
      tokenTtlSeconds: env.PARTNER_TOKEN_TTL_SECONDS,
      clockToleranceSeconds: env.PARTNER_TOKEN_CLOCK_TOLERANCE_SECONDS,
    },
    decision: {
      defaultDeadlineMs: env.DEFAULT_DEADLINE_MS,
      maxDeadlineMs: env.MAX_DEADLINE_MS,
    },
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      tokenEndpointMaxRequests: env.RATE_LIMIT_TOKEN_MAX_REQUESTS,
    },
    sentry: {
      ...(env.SENTRY_DSN === undefined ? {} : { dsn: env.SENTRY_DSN }),
      environment: env.SENTRY_ENVIRONMENT,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    },
    worker: {
      outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
      outboxBatchSize: env.OUTBOX_BATCH_SIZE,
      outboxMaxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      outboxClaimTimeoutMs: env.OUTBOX_CLAIM_TIMEOUT_MS,
      retentionSweepCron: env.RETENTION_SWEEP_CRON,
      retentionSweepBatchSize: env.RETENTION_SWEEP_BATCH_SIZE,
    },
    limits: {
      auditVerifyMaxEvents: env.AUDIT_VERIFY_MAX_EVENTS,
      idempotencyTtlSeconds: env.IDEMPOTENCY_TTL_SECONDS,
    },
  };

  return deepFreeze(config);
};

/** Environment variables carry `\n` as a literal escape; PEM parsing needs real newlines. */
const normalizePem = (value: string): string => value.replace(/\\n/g, '\n');

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
};

let cached: AppConfig | undefined;

/**
 * Loads configuration once per process. Reads `.env` first in development so a local
 * shell needs no extra tooling; in production the platform environment is the only source.
 */
export const loadEnv = (): AppConfig => {
  if (cached === undefined) {
    loadDotEnvFile();
    cached = loadConfig();
  }
  return cached;
};

export const resetConfigForTesting = (): void => {
  cached = undefined;
};

/** Secret-bearing fields, replaced before configuration is ever logged. */
const SECRET_PATHS: readonly string[] = [
  'database.url',
  'database.directUrl',
  'redis.url',
  'supabase.jwtSecret',
  'supabase.serviceRoleKey',
  'partnerAuth.privateKeyPem',
  'partnerAuth.publicKeyPem',
  'sentry.dsn',
];

/**
 * A summary safe to write to a log at startup. Slide 074 keeps secrets out of code and
 * out of tables; this keeps them out of logs too, while still recording enough to debug a
 * bad deployment.
 */
export const describeConfig = (config: AppConfig): Record<string, unknown> => {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  for (const path of SECRET_PATHS) {
    const segments = path.split('.');
    const leaf = segments.pop();
    if (leaf === undefined) {
      continue;
    }
    let cursor: Record<string, unknown> | undefined = clone;
    for (const segment of segments) {
      cursor = cursor?.[segment] as Record<string, unknown> | undefined;
    }
    if (cursor !== undefined && cursor[leaf] !== undefined) {
      cursor[leaf] = '[set]';
    }
  }

  return clone;
};
