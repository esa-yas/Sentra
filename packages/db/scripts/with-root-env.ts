#!/usr/bin/env node
/**
 * Runs the Prisma CLI with the repository-root `.env` applied.
 *
 * Prisma looks for `.env` beside the schema, but this monorepo keeps a single root file so
 * the API, the worker, and migrations cannot drift apart. The loader lives in
 * `@sentra/config` and walks to `pnpm-workspace.yaml`, so it does not depend on cwd.
 *
 * Values already present in the environment always win, so CI and Docker Compose override
 * whatever a developer happens to have on disk.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvFile } from '../../config/src/dotenv';

loadDotEnvFile();

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);

if (command === undefined) {
  process.stderr.write('Usage: with-root-env.ts <command> [args...]\n');
  process.exit(64);
}

const child = spawn(command, args, {
  cwd: packageDir,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

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
