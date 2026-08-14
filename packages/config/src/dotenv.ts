import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A deliberately small `.env` reader for local development.
 *
 * Production configuration arrives from the platform environment (Railway today, Cloud
 * Run later), so this never runs there. Keeping it in-house avoids a dependency whose
 * only job is to parse key-value pairs, and makes the precedence rule explicit: a value
 * already present in the environment always wins, so `docker compose` and CI cannot be
 * silently overridden by a developer's stale file.
 */

const QUOTED = /^(['"])(.*)\1$/s;

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

let alreadyLoaded = false;

/**
 * Loads `.env` from the repository root exactly once, outside production. Returns the
 * keys it applied so a caller can log that configuration came from a file.
 */
export const loadDotEnvFile = (options: { cwd?: string; force?: boolean } = {}): readonly string[] => {
  if (alreadyLoaded && options.force !== true) {
    return [];
  }
  alreadyLoaded = true;

  if (process.env['NODE_ENV'] === 'production') {
    return [];
  }

  const path = resolve(options.cwd ?? process.cwd(), '.env');
  if (!existsSync(path)) {
    return [];
  }

  const applied: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(path, 'utf8')))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }

  return applied;
};

/** Test seam: lets a suite reload a fixture file within one process. */
export const resetDotEnvLoaderForTesting = (): void => {
  alreadyLoaded = false;
};
