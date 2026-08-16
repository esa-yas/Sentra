import { describe, expect, it } from 'vitest';
import { ValidationError } from '@sentra/contracts';
import { describeConfig, loadConfig } from '../config';
import { parseDotEnv } from '../dotenv';

const baseEnv = {
  DATABASE_URL: 'postgresql://sentra:sentra@localhost:5432/sentra?schema=public',
  DATABASE_DIRECT_URL: 'postgresql://sentra:sentra@localhost:5432/sentra?schema=public',
  REDIS_URL: 'redis://localhost:6379',
} satisfies NodeJS.ProcessEnv;

const productionEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pw@db.example.com:6543/sentra?sslmode=require',
  DATABASE_DIRECT_URL: 'postgresql://user:pw@db.example.com:5432/sentra?sslmode=require',
  REDIS_URL: 'rediss://cache.example.com:6379',
  SUPABASE_URL: 'https://project.supabase.co',
  PARTNER_TOKEN_ISSUER: 'https://api.sentra.example',
  PARTNER_TOKEN_PRIVATE_KEY_PEM: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  PARTNER_TOKEN_PUBLIC_KEY_PEM: '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----',
} satisfies NodeJS.ProcessEnv;

const problemsOf = (env: NodeJS.ProcessEnv): string[] => {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return ((error as ValidationError).details?.problems as string[]) ?? [];
  }
};

describe('loadConfig', () => {
  it('applies documented defaults for a local development environment', () => {
    const config = loadConfig(baseEnv);

    expect(config.runtime.nodeEnv).toBe('development');
    expect(config.runtime.isProduction).toBe(false);
    expect(config.api.port).toBe(3000);
    // The spec's own worked example uses a 650 ms budget (slide 031).
    expect(config.decision.defaultDeadlineMs).toBe(650);
    expect(config.worker.outboxMaxAttempts).toBe(8);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = baseEnv;

    expect(problemsOf(withoutDatabase)).toEqual(
      expect.arrayContaining([expect.stringContaining('DATABASE_URL')]),
    );
  });

  it('rejects a connection string that is not PostgreSQL', () => {
    expect(problemsOf({ ...baseEnv, DATABASE_URL: 'mysql://localhost/sentra' })).toEqual(
      expect.arrayContaining([expect.stringContaining('postgresql://')]),
    );
  });

  it('requires a direct connection URL alongside the pooled one', () => {
    // Prisma migrations take advisory locks, which do not survive a transaction pooler,
    // so a deployment missing this variable would fail at migrate time instead of boot.
    const { DATABASE_DIRECT_URL: _omitted, ...withoutDirect } = baseEnv;

    expect(problemsOf(withoutDirect)).toEqual(
      expect.arrayContaining([expect.stringContaining('DATABASE_DIRECT_URL')]),
    );
  });

  it('reports every problem at once rather than one per restart', () => {
    const problems = problemsOf({ REDIS_URL: 'redis://localhost:6379' });

    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a maximum deadline below the default', () => {
    expect(problemsOf({ ...baseEnv, DEFAULT_DEADLINE_MS: '900', MAX_DEADLINE_MS: '500' })).toEqual([
      'MAX_DEADLINE_MS must be greater than or equal to DEFAULT_DEADLINE_MS.',
    ]);
  });

  it('parses a comma-separated CORS origin list', () => {
    const config = loadConfig({
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001, https://console.sentra.example ',
    });

    expect(config.api.corsAllowedOrigins).toEqual([
      'http://localhost:3001',
      'https://console.sentra.example',
    ]);
  });

  it('derives the Supabase JWKS URL from the project URL', () => {
    const config = loadConfig({ ...baseEnv, SUPABASE_URL: 'https://project.supabase.co/' });

    expect(config.supabase.jwksUrl).toBe('https://project.supabase.co/auth/v1/.well-known/jwks.json');
  });

  it('turns escaped newlines in a PEM variable into real newlines', () => {
    const config = loadConfig({
      ...baseEnv,
      PARTNER_TOKEN_PRIVATE_KEY_PEM: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    });

    expect(config.partnerAuth.privateKeyPem).toBe('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
  });

  it('treats a blank optional variable as absent', () => {
    // `.env.example` ships `SENTRY_DSN=` and that must mean "disabled", not "empty string".
    const config = loadConfig({ ...baseEnv, SENTRY_DSN: '', SUPABASE_JWT_SECRET: '   ' });

    expect(config.sentry.dsn).toBeUndefined();
    expect(config.supabase.jwtSecret).toBeUndefined();
  });

  it('returns a deeply frozen object so configuration cannot drift at runtime', () => {
    const config = loadConfig(baseEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.database)).toBe(true);
    expect(() => {
      (config.database as { url: string }).url = 'postgresql://elsewhere';
    }).toThrow();
  });
});

describe('loadConfig in production', () => {
  it('accepts a fully specified production environment', () => {
    const config = loadConfig(productionEnv);

    expect(config.runtime.isProduction).toBe(true);
  });

  it('refuses to boot without a way to verify portal tokens', () => {
    const { SUPABASE_URL: _omitted, ...withoutSupabase } = productionEnv;

    expect(problemsOf(withoutSupabase)).toEqual(
      expect.arrayContaining([expect.stringContaining('SUPABASE_URL')]),
    );
  });

  it('refuses to boot without an asymmetric partner signing key', () => {
    const { PARTNER_TOKEN_PRIVATE_KEY_PEM: _omitted, ...withoutKey } = productionEnv;

    expect(problemsOf(withoutKey)).toEqual(
      expect.arrayContaining([expect.stringContaining('PARTNER_TOKEN_PRIVATE_KEY_PEM')]),
    );
  });

  it('refuses a wildcard CORS origin', () => {
    expect(problemsOf({ ...productionEnv, CORS_ALLOWED_ORIGINS: '*' })).toEqual(
      expect.arrayContaining([expect.stringContaining('wildcard')]),
    );
  });

  it('requires TLS on the database connection', () => {
    expect(
      problemsOf({ ...productionEnv, DATABASE_URL: 'postgresql://user:pw@db.example.com:6543/sentra' }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('TLS')]));
  });

  it('refuses to boot when partner credential bootstrap is enabled', () => {
    expect(problemsOf({ ...productionEnv, PARTNER_BOOTSTRAP_ENABLED: 'true' })).toEqual(
      expect.arrayContaining([expect.stringContaining('PARTNER_BOOTSTRAP_ENABLED')]),
    );
  });
});

describe('describeConfig', () => {
  it('replaces every secret-bearing value with a marker', () => {
    const config = loadConfig({ ...productionEnv, SENTRY_DSN: 'https://key@sentry.io/1' });
    const described = JSON.stringify(describeConfig(config));

    expect(described).not.toContain('pw@db.example.com');
    expect(described).not.toContain('BEGIN PRIVATE KEY');
    expect(described).not.toContain('key@sentry.io');
    expect(described).toContain('[set]');
  });

  it('keeps non-secret values so a bad deployment is still diagnosable', () => {
    const described = describeConfig(loadConfig(baseEnv)) as { api: { port: number } };

    expect(described.api.port).toBe(3000);
  });
});

describe('parseDotEnv', () => {
  it('reads simple assignments and ignores comments and blank lines', () => {
    const values = parseDotEnv('# comment\n\nFOO=bar\nBAZ = qux \n');

    expect(values).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('preserves a value containing an equals sign', () => {
    expect(parseDotEnv('DATABASE_URL=postgresql://a:b@h/db?x=1&y=2')).toEqual({
      DATABASE_URL: 'postgresql://a:b@h/db?x=1&y=2',
    });
  });

  it('expands escaped newlines only inside double quotes', () => {
    expect(parseDotEnv('KEY="line1\\nline2"')).toEqual({ KEY: 'line1\nline2' });
    expect(parseDotEnv("KEY='line1\\nline2'")).toEqual({ KEY: 'line1\\nline2' });
  });

  it('strips a trailing inline comment from an unquoted value', () => {
    expect(parseDotEnv('PORT=3000 # the api port')).toEqual({ PORT: '3000' });
  });

  it('ignores malformed lines rather than throwing', () => {
    expect(parseDotEnv('NOT_AN_ASSIGNMENT\n=missing-key\n1BAD=value\nGOOD=1')).toEqual({ GOOD: '1' });
  });
});
