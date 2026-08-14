# Sentra database setup

Prisma is the single source of truth for the data model. Supabase is used as managed
PostgreSQL. Every schema change is a **version-controlled Prisma migration**; there are no
undocumented dashboard edits, and `prisma db push` is never used for a shared database.

The same migrations apply unchanged to a plain PostgreSQL container, to Supabase, and to
Google Cloud SQL, because the schema uses only standard PostgreSQL features.

- Schema: `packages/db/prisma/schema.prisma`
- Migrations: `packages/db/prisma/migrations/*`
- Seed (synthetic only): `packages/db/prisma/seed.ts`
- Client factory: `packages/db/src/client.ts`
- Integration suite: `tests/integration/*`

---

## 1. The one controlled migration workflow

Follow this loop for every schema change. Never edit the database by hand.

1. Edit `packages/db/prisma/schema.prisma`.
2. Generate a versioned migration **without applying it**, so you can review the SQL:
   ```bash
   pnpm --filter @sentra/db exec node scripts/with-root-env.mjs \
     prisma migrate dev --name <change_name> --create-only
   ```
3. Review the generated `migration.sql`. Confirm it is standard PostgreSQL (no
   Supabase-only syntax). Add raw SQL here for anything Prisma cannot express (check
   constraints, triggers, `ENABLE ROW LEVEL SECURITY`) — see the hardening migration for the
   pattern.
4. Apply it to your **local** database and regenerate the client:
   ```bash
   pnpm db:migrate     # prisma migrate dev
   ```
5. Run the seed and the integration suite (both target local databases only):
   ```bash
   pnpm db:seed
   pnpm test:integration
   ```
6. Verify status is clean:
   ```bash
   pnpm --filter @sentra/db run status
   ```
7. Commit `schema.prisma`, the new `migrations/**/migration.sql`, and any changed tests
   together in one commit.
8. Apply to a shared environment (dev Supabase, staging, production) with **deploy**, never
   `migrate dev`:
   ```bash
   pnpm db:deploy      # prisma migrate deploy
   ```

> `prisma db push` is only for throwaway local experiments. It does **not** create migration
> history, so anything it changes is invisible to other environments and to code review. Do
> not use it against Supabase, staging, or production.

---

## 2. Connection configuration

Prisma needs two URLs, and Supabase offers two poolers plus a direct connection. Use them as
follows:

| Consumer | Connection | Env var | Supabase source |
| --- | --- | --- | --- |
| Express API (runtime) | Transaction pooler, port `6543` | `DATABASE_URL` | Connection string → *Transaction pooler* |
| BullMQ workers (Postgres access) | Transaction pooler, port `6543` | `DATABASE_URL` | Connection string → *Transaction pooler* |
| Prisma migrations (`migrate dev` / `deploy`) | Direct connection, port `5432` | `DATABASE_DIRECT_URL` | Connection string → *Direct connection* |
| Local development | Local Docker Postgres (both URLs identical) | both | — |
| Railway deployment | Runtime uses the transaction pooler; the release/migrate step uses the direct URL | both | — |

Why:

- **Transaction pooler (6543)** gives many short-lived connections and survives autoscaling,
  which suits the API and the workers (short transactions, `FOR UPDATE SKIP LOCKED` claims).
  The client factory automatically appends `pgbouncer=true` on port `6543`, because a
  transaction-mode pooler cannot hold session-level prepared statements.
- **Direct connection (5432)** is required for migrations: Prisma takes an advisory lock and
  issues DDL, neither of which is safe through a transaction pooler.
- If a worker ever needs session-level features (advisory locks held across statements,
  `LISTEN/NOTIFY`), point that worker at Supabase's **session pooler** instead; our current
  outbox/retention workers do not need it.

Security:

- Passwords live only in `.env` (local) or the platform's secret store (Railway/Supabase).
  They are never logged, committed, screenshotted, or bundled into the frontend.
- In production, append `sslmode=require` to both URLs. Supabase and Cloud SQL both require
  TLS.

---

## 3. Row-level security and table classification

**Every table is backend-service-only.** Browsers never talk to the database through the
Supabase client; they reach data only through the Express API, which authenticates the
caller and scopes every query by tenant. The Next.js app holds no service-role key and no
direct database credential.

Because Supabase exposes `public` tables through PostgREST by default, the hardening
migration (`20260814211222_hardening_rls_checks_triggers`) runs
`ALTER TABLE … ENABLE ROW LEVEL SECURITY` on **all 21 application tables** and adds **no
policies**. The effect:

- The role Prisma connects as **owns** the tables and therefore **bypasses RLS** — the API
  keeps full access.
- Supabase's `anon` and `authenticated` roles are **denied by default**, because no policy
  grants them access. This is defence in depth: even a misconfigured PostgREST cannot read a
  single row.

| Classification | Tables | Exposed via Supabase client? | RLS |
| --- | --- | --- | --- |
| Backend-service-only (tenant-scoped) | `organizations`, `organization_members`, `partner_connections`, `partner_signing_keys`, `consent_records`, `telecom_risk_events`, `payment_intents`, `correlation_cases`, `risk_assessments`, `recommendations`, `bank_outcomes`, `notification_records`, `idempotency_keys`, `retention_policies` | No | Enabled, deny-all |
| Backend-service-only (platform/operational) | `audit_events`, `outbox_events`, `inbox_events`, `retention_runs`, `operational_events`, `users`, `identity_links` | No | Enabled, deny-all |

No table requires permissive RLS policies today because none is exposed to the browser. If a
future feature genuinely needs direct Supabase-client reads, that table gets explicit
tenant/user policies and their access/denial tests **before** it is exposed — this is called
out in the security review checklist.

**The Supabase service-role key must never appear in Next.js client code or any browser
environment.** It belongs to the API/worker processes only.

### Requirement: Prisma must connect as the table owner

Owner-bypass is what keeps the API working while RLS denies everyone else. On Supabase the
default `postgres` role owns `public` tables, so the standard connection string is correct.
If you create a dedicated application role, either make it the table owner or grant it
`BYPASSRLS`; otherwise the API will be denied by its own deny-all policies.

---

## 4. Multi-tenancy

Every tenant-owned record carries an `organizationId` foreign key. Isolation is enforced in
three layers:

- **API authorization** — the caller's membership/partner scope is checked before any query,
  and every query is filtered by `organizationId`. Hiding a UI control is never treated as
  security.
- **Tenant-aware unique constraints** — natural keys are scoped to the tenant so the same
  value can exist for different tenants without collision:
  - `consent_records (organizationId, subjectRef, purpose)`
  - `bank_outcomes (organizationId, caseId)`
  - `notification_records (organizationId, dedupeKey)`
  - `idempotency_keys (organizationId, scope, key)`
  - `partner_connections (organizationId, name)`
  - `organization_members (organizationId, userId)`
- **RLS deny-all** — no cross-tenant read is possible through the Supabase client at all.

The integration suite proves the same subject/purpose is allowed across two tenants while a
tenant-scoped read never returns another tenant's rows (`tests/integration/domain.test.ts`).

---

## 5. What the migrations contain

- `20260811075036_foundation_tenancy_audit_outbox` — tenancy, partners, hash-chained audit,
  transactional outbox/inbox, idempotency, retention.
- `20260814211146_domain_decisioning_tables` — consent, telecom risk events, payment intents,
  correlation cases, risk assessments, recommendations, bank outcomes, notifications,
  operational events, with all foreign keys, indexes, and tenant-aware unique constraints.
- `20260814211222_hardening_rls_checks_triggers` — check constraints (amount ≥ 0, score
  0–100, uncertainty 0–1, attempt ≥ 1, …), a portable `set_updated_at()` trigger on every
  table with an `updatedAt` column, and RLS enablement on all tables.

Safe rollback: PostgreSQL DDL migrations are not auto-reversible. To undo the most recent
migration on a **development** database, restore from a snapshot or run `pnpm db:reset`
(destructive — see §7). For staging/production, roll forward with a new migration that
reverses the change; never hand-edit an applied migration file.

---

## 6. Verification

```bash
# Tables, indexes, RLS, check constraints, triggers (real PostgreSQL, not a fake):
pnpm test:integration
```

The suite covers: migrations apply to an empty database, seed idempotency, foreign-key
integrity, unique/idempotency constraints, tenant isolation, transaction rollback,
audit-chain ordering, concurrent audit writes, transactional-outbox atomicity, exclusive
outbox claiming (`FOR UPDATE SKIP LOCKED`), duplicate-message handling, and index-backed
pagination.

Manual spot checks (any psql client):

```sql
-- All application tables have RLS on (expect 0 rows):
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename <> '_prisma_migrations' AND rowsecurity IS NOT TRUE;

-- Domain tables exist (expect 9 rows):
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
 ('consent_records','telecom_risk_events','payment_intents','correlation_cases',
  'risk_assessments','recommendations','bank_outcomes','notification_records',
  'operational_events') ORDER BY 1;

-- Check constraints present:
SELECT conname FROM pg_constraint WHERE contype='c'
  AND conname IN ('payment_intents_amount_nonneg','risk_assessments_score_range',
                  'recommendations_uncertainty_range') ORDER BY 1;
```

---

## 7. Resetting a development database (destructive)

> **WARNING.** `pnpm db:reset` **drops every table and all data** in the database named by
> `DATABASE_URL`/`DATABASE_DIRECT_URL`, then re-applies all migrations and re-seeds. Only run
> it against a local or a disposable development database. Never point it at staging,
> production, or a shared Supabase project with data you care about. Confirm which database
> your `.env` targets first.

```bash
pnpm db:reset      # prisma migrate reset --force  (drops, re-migrates, re-seeds)
```

The integration suite never uses this command; it cleans only `sentra_test` via raw SQL and
refuses to run unless `TEST_DATABASE_URL` is a local `*_test` database.

---

## SUPABASE SETUP — ACTIONS FOR THE FOUNDER

Do these in order the first time you connect a development Supabase project.

### 1. Environment variables to create (in `.env`, and in Railway/Supabase secrets for deploys)

- `DATABASE_URL` — pooled runtime connection (transaction pooler, port 6543).
- `DATABASE_DIRECT_URL` — direct connection for migrations (port 5432).
- `TEST_DATABASE_URL` — a local `*_test` database for the integration suite (leave pointed at
  local Docker; do **not** point it at Supabase).
- Already present and unchanged by this work: `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
  `SUPABASE_JWT_AUDIENCE`, `SUPABASE_SERVICE_ROLE_KEY` (API/worker only),
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 2. Where each value is found in the Supabase dashboard

- **Database URLs:** Project → **Settings → Database → Connection string**.
  - `DATABASE_URL` = the **Transaction pooler** string (host `…pooler.supabase.com`, `:6543`).
  - `DATABASE_DIRECT_URL` = the **Direct connection** string (host `db.<ref>.supabase.co`, `:5432`).
  - Put your database password in place of `[YOUR-PASSWORD]`; append `&sslmode=require` for any non-local use.
- **`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`:** Settings → **API → Project URL**.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`:** Settings → **API → Project API keys → anon/public**.
- **`SUPABASE_SERVICE_ROLE_KEY`:** Settings → **API → Project API keys → service_role** (API/worker only — never in the browser).
- **JWT settings:** Settings → **API → JWT Settings**.

### 3. Link / target the Supabase project (Prisma-based; no Supabase CLI required)

You do not need `supabase link` for this workflow — Prisma connects over the two URLs. Just
set `DATABASE_URL` and `DATABASE_DIRECT_URL` in `.env` to the Supabase strings from step 2.
(If you also want the Supabase CLI for Studio/local stack: `npm i -g supabase` then
`supabase login` and `supabase link --project-ref <ref>` — optional, not part of the
migration path.)

### 4. Generate and apply migrations

- Local authoring (creates history): `pnpm db:migrate`
- Apply the committed history to the Supabase dev project (no diffing, no shadow DB):
  ```bash
  pnpm db:deploy
  ```

### 5. Seed synthetic development data

```bash
pnpm db:seed
```

Idempotent and synthetic only (one platform tenant, a synthetic bank and telecom, a dev
operator, retention defaults, and one end-to-end APP-scam case). Safe to run repeatedly.

### 6. SQL to paste into the Supabase SQL Editor

**None is required.** Row-level security, check constraints, and triggers are all in the
committed migrations and are applied by `pnpm db:deploy`. Prefer this over manual SQL.

Optional extra hardening (belt-and-braces; RLS already denies these roles): you may revoke
default table privileges from the API roles so nothing depends on RLS alone.

```sql
-- OPTIONAL. Safe to run; not required because RLS is already deny-all on every table.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

### 7. Verify every required table, index, and constraint

Run the SQL spot checks in §6 in the Supabase SQL Editor, and/or:

```bash
pnpm --filter @sentra/db run status   # migration history matches
```

### 8. Test the application's database connection

```bash
# Quick connectivity + schema check against the configured database:
pnpm --filter @sentra/db run status
# Or start the API and hit readiness (checks the DB dependency):
pnpm dev:api    # then: curl -s localhost:3000/ready
```

### 9. Confirm audit, transaction, and outbox behaviour

```bash
pnpm test:integration
```

This exercises audit-chain ordering and concurrent writes, transactional-outbox atomicity,
exclusive claiming, and duplicate handling against real PostgreSQL.

### 10. Reset only a development database safely

```bash
pnpm db:reset   # DESTRUCTIVE — drops & recreates the DB in DATABASE_URL, then re-seeds
```

Only against a local/disposable dev database. See §7.

### 11. Warnings before destructive commands

- `pnpm db:reset` and `prisma migrate reset` **destroy all data** in the targeted database.
- The `REVOKE`/`DROP`/`TRUNCATE` statements and any manual DDL are irreversible.
- Always confirm which database your `.env` points at before running any of these.
- Never run a reset or a destructive statement against a shared Supabase project, staging, or
  production without an explicit, current backup.

---

## Portability to Google Cloud SQL / GCP

The schema and migrations are plain PostgreSQL and move to Cloud SQL for PostgreSQL with no
change. Component-by-component:

| Supabase component | Cloud SQL / GCP replacement | Notes |
| --- | --- | --- |
| Managed PostgreSQL (poolers + direct) | Cloud SQL for PostgreSQL; PgBouncer sidecar or the Cloud SQL Auth Proxy for pooling | Same two-URL split (pooled runtime + direct for migrations). |
| RLS deny-all on `public` | Identical — RLS is core PostgreSQL | On Cloud SQL there is no PostgREST, so deny-all is simply inert defence in depth. |
| `set_updated_at()` trigger, check constraints, enums | Identical | Standard SQL objects; no change. |
| Supabase Auth (JWT verification) | Identity Platform / Firebase Auth or another OIDC issuer | Isolated behind the token-verifier port; swap issuer/JWKS, not the schema. |
| Service-role key | GCP service account + IAM | Same rule: server-side only, never in the browser. |
| Supabase Storage bucket | Google Cloud Storage bucket | Behind a storage port; only the adapter changes. |
| SQL migrations | Identical `prisma migrate deploy` in the release step | Migration history is the portable contract. |

Anything Supabase-specific (the optional `anon`/`authenticated` REVOKE, JWKS URL derivation)
lives in configuration or an adapter, never in the schema or core business logic.
