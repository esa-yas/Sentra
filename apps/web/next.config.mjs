/**
 * Next.js configuration for the Sentra Operations Console.
 *
 * The console is a presentation shell: it holds no business logic and never touches the
 * database (enforced by dependency-cruiser). It reaches the Express API through a rewrite
 * so the browser calls same-origin `/api/*` and `/health` — this keeps correlation-id
 * response headers readable without CORS gymnastics and keeps the API origin configurable
 * in one place. Set SENTRA_API_ORIGIN to point at a non-default API.
 *
 * The repository-root `.env` is applied here (walk to pnpm-workspace.yaml, not cwd) so
 * `pnpm --filter @sentra/web` still sees NEXT_PUBLIC_* from the single root file.
 * Existing environment values win. Production does not read the file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resolveRepositoryRoot = (from) => {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Unable to locate the Sentra repository root from ${from}.`);
    }
    dir = parent;
  }
};

const repoRoot = resolveRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
const envFile = join(repoRoot, '.env');

if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    if (process.env[key] === undefined) {
      process.env[key] = line.slice(separatorIndex + 1).trim();
    }
  }
}

const apiOrigin = process.env.SENTRA_API_ORIGIN ?? 'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/health', destination: `${apiOrigin}/health` },
      { source: '/ready', destination: `${apiOrigin}/ready` },
    ];
  },
};

export default nextConfig;
