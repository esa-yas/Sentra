import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@sentra/contracts';
import { loadEnv, resetConfigForTesting } from '../config';
import {
  loadDotEnvFile,
  resetDotEnvLoaderForTesting,
  resolveRepositoryRoot,
} from '../dotenv';

const PROBE = 'SENTRA_DOTENV_PROBE';

const requiredKeys = ['DATABASE_URL', 'DATABASE_DIRECT_URL', 'REDIS_URL'] as const;

const makeFixtureRepo = (withEnv: boolean): string => {
  const root = mkdtempSync(join(tmpdir(), 'sentra-env-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  mkdirSync(join(root, 'apps/worker'), { recursive: true });
  if (withEnv) {
    writeFileSync(join(root, '.env'), `${PROBE}=from-root\n`);
  }
  return root;
};

describe('repository-root dotenv loading', () => {
  afterEach(() => {
    delete process.env[PROBE];
    resetDotEnvLoaderForTesting();
    resetConfigForTesting();
  });

  it('resolves the real repository from apps/api and apps/worker without using cwd', () => {
    const sentraRoot = resolveRepositoryRoot();
    const fixture = makeFixtureRepo(false);
    const previousCwd = process.cwd();
    process.chdir(join(fixture, 'apps/api'));
    try {
      expect(resolveRepositoryRoot()).toBe(sentraRoot);
      expect(resolveRepositoryRoot(join(sentraRoot, 'apps/api'))).toBe(sentraRoot);
      expect(resolveRepositoryRoot(join(sentraRoot, 'apps/worker'))).toBe(sentraRoot);
      expect(resolveRepositoryRoot(join(fixture, 'apps/api'))).toBe(fixture);
      expect(resolveRepositoryRoot(join(fixture, 'apps/worker'))).toBe(fixture);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('loads the repository-root .env when started from apps/api', () => {
    const root = makeFixtureRepo(true);
    const previousCwd = process.cwd();
    process.chdir(join(root, 'apps/api'));
    try {
      const result = loadDotEnvFile({ force: true, from: join(root, 'apps/api') });
      expect(result.fileFound).toBe(true);
      expect(result.envFilePath).toBe(join(root, '.env'));
      expect(process.env[PROBE]).toBe('from-root');
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('loads the repository-root .env when started from apps/worker', () => {
    const root = makeFixtureRepo(true);
    const previousCwd = process.cwd();
    process.chdir(join(root, 'apps/worker'));
    try {
      const result = loadDotEnvFile({ force: true, from: join(root, 'apps/worker') });
      expect(result.fileFound).toBe(true);
      expect(process.env[PROBE]).toBe('from-root');
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('lets existing environment values win over the file', () => {
    const root = makeFixtureRepo(true);
    process.env[PROBE] = 'from-shell';
    loadDotEnvFile({ force: true, from: root });
    expect(process.env[PROBE]).toBe('from-shell');
  });

  it('does not load a local .env file in production', () => {
    const root = makeFixtureRepo(true);
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const result = loadDotEnvFile({ force: true, from: root });
      expect(result.skippedBecauseProduction).toBe(true);
      expect(process.env[PROBE]).toBeUndefined();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previousNodeEnv;
      }
    }
  });

  it('produces a clear validation error when the root .env is missing', () => {
    const root = makeFixtureRepo(false);
    const saved: Partial<Record<(typeof requiredKeys)[number], string | undefined>> = {};
    for (const key of requiredKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }

    try {
      loadDotEnvFile({ force: true, from: root });
      expect(() => loadEnv()).toThrow(ValidationError);
      try {
        loadEnv();
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const problems = ((error as ValidationError).details?.problems as string[]) ?? [];
        expect(problems[0]).toContain(join(root, '.env'));
        expect(problems[0]).toContain('repository root');
        expect(problems.some((problem) => problem.includes('DATABASE_URL'))).toBe(true);
      }
    } finally {
      for (const key of requiredKeys) {
        const value = saved[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
