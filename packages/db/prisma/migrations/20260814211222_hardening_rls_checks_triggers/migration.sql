-- Hardening migration: check constraints, updated_at triggers, and row-level security.
--
-- Every statement below is standard PostgreSQL and applies unchanged to Supabase and to
-- Google Cloud SQL for PostgreSQL. Nothing here is Supabase-specific.
--
-- Row-level security is enabled with NO policies. On Supabase this denies the PostgREST
-- `anon` and `authenticated` roles by default, while the application's owner role (the role
-- Prisma connects as) BYPASSES RLS as the table owner and keeps full access. The Supabase
-- role GRANT/REVOKE is intentionally NOT placed here, because `anon`/`authenticated` do not
-- exist on a plain PostgreSQL or Cloud SQL instance; that bootstrap lives in the founder
-- setup guide so this migration stays portable.

-- ---------------------------------------------------------------------------
-- Check constraints. Prisma v6 has no schema-level CHECK support, so the invariants the
-- contracts guarantee in code are also enforced by the database.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_amount_nonneg" CHECK ("amountMinor" >= 0),
  ADD CONSTRAINT "payment_intents_payee_age_nonneg" CHECK ("payeeAgeDays" >= 0),
  ADD CONSTRAINT "payment_intents_velocity_nonneg" CHECK ("paymentVelocity24h" >= 0),
  ADD CONSTRAINT "payment_intents_prev_warnings_nonneg" CHECK ("previousWarnings" >= 0);

ALTER TABLE "telecom_risk_events"
  ADD CONSTRAINT "telecom_risk_events_call_duration_nonneg" CHECK ("callDurationSeconds" >= 0);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "risk_assessments_score_range" CHECK ("riskScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "risk_assessments_uncertainty_range" CHECK ("uncertainty" >= 0 AND "uncertainty" <= 1),
  ADD CONSTRAINT "risk_assessments_processing_nonneg" CHECK ("processingTimeMs" >= 0);

ALTER TABLE "recommendations"
  ADD CONSTRAINT "recommendations_score_range" CHECK ("riskScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "recommendations_uncertainty_range" CHECK ("uncertainty" >= 0 AND "uncertainty" <= 1);

ALTER TABLE "operational_events"
  ADD CONSTRAINT "operational_events_attempt_positive" CHECK ("attempt" >= 1);

ALTER TABLE "notification_records"
  ADD CONSTRAINT "notification_records_attempt_positive" CHECK ("attempt" >= 1);

-- ---------------------------------------------------------------------------
-- updated_at trigger. Guarantees the column is maintained even for writes that do not go
-- through Prisma (raw SQL, seeds, future services). Portable to Cloud SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations', 'users', 'organization_members', 'partner_connections',
    'retention_policies', 'consent_records', 'correlation_cases',
    'bank_outcomes', 'notification_records'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I;', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: deny by default on every application table. The owner role that
-- Prisma connects as bypasses RLS, so the Express API keeps full access; any other role
-- (for example Supabase PostgREST's anon/authenticated) is denied because no policy grants
-- access. Every table is backend-service-only: browsers reach data through the Express API,
-- never through the Supabase client, so no permissive policies are required.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations', 'users', 'identity_links', 'organization_members',
    'partner_connections', 'partner_signing_keys', 'audit_events', 'outbox_events',
    'inbox_events', 'idempotency_keys', 'retention_policies', 'retention_runs',
    'consent_records', 'telecom_risk_events', 'payment_intents', 'correlation_cases',
    'risk_assessments', 'recommendations', 'bank_outcomes', 'notification_records',
    'operational_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END;
$$;
