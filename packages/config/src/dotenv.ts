import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * A deliberately small `.env` reader for local development.
 *
 * Production configuration arrives from the platform environment (Railway today, Cloud
 * Run later), so this never runs there. Keeping it in-house avoids a dependency whose
 * only job is to parse key-value pairs, and makes the precedence rule explicit: a value
 * already present in the environment always wins, so `docker compose` and CI cannot be
 * silently overridden by a developer's stale file.
 *
 * The file is always the repository-root `.env`. Resolution walks up from this module
 * (or an explicit `from` directory) until it finds `pnpm-workspace.yaml`, so `pnpm
 * --filter` changing `process.cwd()` to `apps/api` or `apps/worker` cannot pick the
 * wrong file.
 */

const QUOTED = /^(['"])(.*)\1$/s;
const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export interface LoadDotEnvOptions {
  /** Directory to start the repository-root walk from. Defaults to this module's directory. */
  readonly from?: string;
  /** Explicit `.env` path. Used by tests; production code should omit this. */
  readonly envFile?: string;
  readonly force?: boolean;
}

export interface DotEnvLoadResult {
  readonly appliedKeys: readonly string[];
  readonly envFilePath: string;
  readonly fileFound: boolean;
  readonly skippedBecauseProduction: boolean;
}

export const parseDotEnv = (contents: string): Record<string, string> => {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const quoted = QUOTED.exec(value);
    if (quoted?.[2] !== undefined) {
      // Only a double-quoted value expands escape sequences, matching shell behaviour.
      value = quoted[1] === '"' ? quoted[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t') : quoted[2];
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trimEnd();
      }
    }

    values[key] = value;
  }

  return values;
};

/**
 * Walks up from `from` until `pnpm-workspace.yaml` is found. Independent of `process.cwd()`.
 */
export const resolveRepositoryRoot = (from: string = __dirname): string => {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Unable to locate the Sentra repository root from ${resolve(from)} (no ${WORKSPACE_MARKER}).`,
      );
    }
    dir = parent;
  }
};

export const resolveRootEnvFile = (from?: string): string => join(resolveRepositoryRoot(from), '.env');

let alreadyLoaded = false;
let lastResult: DotEnvLoadResult | undefined;

/**
 * Loads the repository-root `.env` exactly once, outside production. Existing process
 * environment values always win. Never logs values.
 */
export const loadDotEnvFile = (options: LoadDotEnvOptions = {}): DotEnvLoadResult => {
  const envFilePath = options.envFile ?? resolveRootEnvFile(options.from);

  if (alreadyLoaded && options.force !== true) {
    return (
      lastResult ?? {
        appliedKeys: [],
        envFilePath,
        fileFound: existsSync(envFilePath),
        skippedBecauseProduction: false,
      }
    );
  }
  alreadyLoaded = true;

  if (process.env['NODE_ENV'] === 'production') {
    lastResult = {
      appliedKeys: [],
      envFilePath,
      fileFound: existsSync(envFilePath),
      skippedBecauseProduction: true,
    };
    return lastResult;
  }

  if (!existsSync(envFilePath)) {
    lastResult = { appliedKeys: [], envFilePath, fileFound: false, skippedBecauseProduction: false };
    return lastResult;
  }

  const appliedKeys: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(envFilePath, 'utf8')))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      appliedKeys.push(key);
    }
  }

  lastResult = { appliedKeys, envFilePath, fileFound: true, skippedBecauseProduction: false };
  return lastResult;
};

/** Test seam: lets a suite reload a fixture file within one process. */
export const resetDotEnvLoaderForTesting = (): void => {
  alreadyLoaded = false;
  lastResult = undefined;
};
