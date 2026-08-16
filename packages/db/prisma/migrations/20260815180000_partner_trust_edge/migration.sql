-- Slice 4A: partner environment, last-used timestamps, cases:read scope, and API activity log.
--
-- Generated with --create-only intent against local schema. Do not apply to remote Supabase
-- without founder approval. Local integration tests apply this via `prisma migrate deploy`
-- against sentra_test only.

-- PostgreSQL 12+ allows ADD VALUE inside a transaction; the new value is not used in this
-- migration, so the "cannot be used until committed" restriction is satisfied.
ALTER TYPE "PartnerScope" ADD VALUE 'CASES_READ';

CREATE TYPE "PartnerEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

ALTER TABLE "partner_connections"
  ADD COLUMN "environment" "PartnerEnvironment" NOT NULL DEFAULT 'SANDBOX',
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE INDEX "partner_connections_environment_status_idx"
  ON "partner_connections"("environment", "status");

ALTER TABLE "partner_signing_keys"
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE TABLE "partner_api_requests" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "partnerConnectionId" TEXT,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "correlationId" TEXT NOT NULL,
  "authentication" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "replay" TEXT NOT NULL,
  "idempotency" TEXT NOT NULL,
  "rateLimit" TEXT NOT NULL,
  "errorCode" TEXT,
  "environment" TEXT NOT NULL,
  "synthetic" BOOLEAN NOT NULL DEFAULT true,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "partner_api_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_api_requests_occurredAt_idx" ON "partner_api_requests"("occurredAt" DESC);
CREATE INDEX "partner_api_requests_correlationId_idx" ON "partner_api_requests"("correlationId");
CREATE INDEX "partner_api_requests_organizationId_occurredAt_idx" ON "partner_api_requests"("organizationId", "occurredAt" DESC);
CREATE INDEX "partner_api_requests_partnerConnectionId_occurredAt_idx" ON "partner_api_requests"("partnerConnectionId", "occurredAt" DESC);
CREATE INDEX "partner_api_requests_endpoint_method_idx" ON "partner_api_requests"("endpoint", "method");
CREATE INDEX "partner_api_requests_statusCode_idx" ON "partner_api_requests"("statusCode");

ALTER TABLE "partner_api_requests"
  ADD CONSTRAINT "partner_api_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_api_requests"
  ADD CONSTRAINT "partner_api_requests_partnerConnectionId_fkey"
  FOREIGN KEY ("partnerConnectionId") REFERENCES "partner_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_api_requests" ENABLE ROW LEVEL SECURITY;
