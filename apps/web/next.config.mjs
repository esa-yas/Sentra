/**
 * Next.js configuration for the Sentra Operations Console.
 *
 * The console is a presentation shell: it holds no business logic and never touches the
 * database (enforced by dependency-cruiser). It reaches the Express API through a rewrite
 * so the browser calls same-origin `/api/*` and `/health` — this keeps correlation-id
 * response headers readable without CORS gymnastics and keeps the API origin configurable
 * in one place. Set SENTRA_API_ORIGIN to point at a non-default API.
 */
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
