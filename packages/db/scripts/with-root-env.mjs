#!/usr/bin/env node
/**
 * Runs the Prisma CLI with the repository-root `.env` applied.
 *
 * Prisma looks for `.env` beside the schema, but this monorepo keeps a single root file so
 * the API, the worker, and migrations cannot drift apart. Rather than duplicating the file
 * or adding a dependency whose only job is to load it, this wrapper reuses the same parser
 * the application uses at boot.
 *
 * Values already present in the environment always win, so CI and Docker Compose override
 * whatever a developer happens to have on disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repoRoot = resolve(packageDir, '../..');

const parseDotEnv = (contents) => {
  const values = {};
  const quoted = /^(['"])(.*)\1$/s;

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
    const match = quoted.exec(value);
    if (match) {
      value = match[1] === '"' ? match[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t') : match[2];
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

const env = { ...process.env };
const envFile = resolve(repoRoot, '.env');

if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(envFile, 'utf8')))) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

const [command, ...args] = process.argv.slice(2);

if (command === undefined) {
  process.stderr.write('Usage: with-root-env.mjs <command> [args...]\n');
  process.exit(64);
}

const child = spawn(command, args, { cwd: packageDir, env, stdio: 'inherit', shell: false });

child.on('error', (error) => {
  process.stderr.write(`Failed to run ${command}: ${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
