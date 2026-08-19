# Running the Sentra console locally

One-time prerequisites:

- Docker Desktop running (for local Postgres + Redis).
- A repository-root `.env` with real Supabase values, including
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (these enable the login gate).

## Start it

```bash
pnpm dev:infra      # once per session: brings up local Postgres + Redis
pnpm dev:real       # API + worker + web, all in real (authenticated) mode
```

Then open **http://localhost:3001** and sign in with your Supabase user.

- Web console: http://localhost:3001
- API: http://localhost:3000 (the web proxies to it automatically)

`pnpm dev` (without `:real`) runs in **in-memory demo mode** — the console is open, no login,
and data is a single synthetic session. Real mode is what enforces auth, per-tenant scoping,
and persistence.

## If the console misbehaves

Next.js dev caches occasionally corrupt after many hot-reloads. The tell is a
`Cannot find module './NNN.js'` error or pages returning 500. The fix is one command:

```bash
pnpm dev:clean      # clears apps/web/.next, then starts in real mode
```

If a port is stuck (`EADDRINUSE` on 3000/3001/3002), fully stop the previous `pnpm dev`
(Ctrl+C so all three processes exit) before restarting — a leftover process from an earlier
run is holding the port.

## Granting yourself access

A user is created on first sign-in but has **no organization membership** (so protected
screens are empty and `/api/members` returns 403 until granted). Grant a role once:

```bash
pnpm exec tsx packages/db/scripts/grant-membership.ts you@example.com OWNER
```

After that you can manage other members from the **Members** screen in the console.
