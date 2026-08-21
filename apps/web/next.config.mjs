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

// The web app serves on port 3000 (the single URL you visit); the API runs on 3001 and is
// reached only through these server-side rewrites. Default to the IPv4 loopback rather than
// `localhost`: on dual-stack machines `localhost` resolves to IPv6 `::1` first, so 127.0.0.1
// avoids reaching the wrong server. Override with SENTRA_API_ORIGIN when the API is elsewhere.
const apiOrigin = process.env.SENTRA_API_ORIGIN ?? 'http://127.0.0.1:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build output directory. Defaults to `.next`, which is also what `next dev` uses — so a
  // production build run while a dev server is up overwrites the dev server's manifests and
  // breaks it with "ENOENT ... app-build-manifest.json". Set NEXT_DIST_DIR (see the web
  // package's `build:check` script) to build into a separate directory instead.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Allow loading the dev server over the LAN (e.g. http://192.168.1.3:3000) without Next's
  // cross-origin dev warning. Update the IP if your machine's LAN address changes; extra values
  // can be supplied via SENTRA_DEV_ORIGINS (comma-separated hostnames).
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.1.3',
    ...(process.env.SENTRA_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  ],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      // The public developer API (documented at /docs) is reachable same-origin so the docs'
      // "try it" console can call it without CORS.
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
      { source: '/health', destination: `${apiOrigin}/health` },
      { source: '/ready', destination: `${apiOrigin}/ready` },
    ];
  },
};

export default nextConfig;
