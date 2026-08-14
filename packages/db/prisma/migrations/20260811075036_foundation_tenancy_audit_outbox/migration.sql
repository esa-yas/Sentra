-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('BANK', 'TELECOM', 'PLATFORM');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'AUDITOR', 'OPERATOR');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('PROTECT_PAYMENT', 'FRAUD_INVESTIGATION', 'SERVICE_OPERATION', 'AUDIT_COMPLIANCE', 'CONSENT_MANAGEMENT', 'PARTNER_ADMINISTRATION', 'ANALYTICS_AGGREGATE');

-- CreateEnum
CREATE TYPE "PartnerConnectionKind" AS ENUM ('BANK_API', 'TELECOM_EVENTS');

-- CreateEnum
CREATE TYPE "PartnerConnectionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PartnerScope" AS ENUM ('PAYMENT_INTENTS_WRITE', 'RISK_EVENTS_WRITE', 'RECOMMENDATIONS_READ', 'OUTCOMES_WRITE');

-- CreateEnum
CREATE TYPE "SigningKeyStatus" AS ENUM ('ACTIVE', 'RETIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'PARTNER', 'SYSTEM', 'JOB');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOWED', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RetentionAction" AS ENUM ('DELETE', 'ANONYMIZE');

-- CreateEnum
CREATE TYPE "RetentionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RetentionRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "jurisdiction" CHAR(2) NOT NULL,
    "dataResidency" CHAR(2) NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "primaryEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartnerConnectionKind" NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "scopes" "PartnerScope"[],
    "allowedPurposes" "Purpose"[],
    "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenTtlSeconds" INTEGER NOT NULL DEFAULT 300,
    "status" "PartnerConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRotatedAt" TIMESTAMP(3),
    "rotationDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT,

    CONSTRAINT "partner_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_signing_keys" (
    "id" TEXT NOT NULL,
    "partnerConnectionId" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "publicKeyJwk" JSONB NOT NULL,
    "status" "SigningKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT,

    CONSTRAINT "partner_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "organizationId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "purpose" "Purpose" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'ALLOWED',
    "correlationId" TEXT NOT NULL,
    "requestId" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "dataBefore" JSONB,
    "dataAfter" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hashPrev" TEXT NOT NULL,
    "hashSelf" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "retentionPolicyId" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "correlationId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "responseHash" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "resourceType" TEXT NOT NULL,
    "purpose" "Purpose" NOT NULL,
    "retentionSeconds" INTEGER NOT NULL,
    "action" "RetentionAction" NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RetentionPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_runs" (
    "id" TEXT NOT NULL,
    "retentionPolicyId" TEXT NOT NULL,
    "status" "RetentionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsAffected" INTEGER NOT NULL DEFAULT 0,
    "proofHash" TEXT,
    "error" TEXT,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "retention_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_primaryEmail_key" ON "users"("primaryEmail");

-- CreateIndex
CREATE INDEX "identity_links_userId_idx" ON "identity_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_issuer_subject_key" ON "identity_links"("issuer", "subject");

-- CreateIndex
CREATE INDEX "organization_members_userId_status_idx" ON "organization_members"("userId", "status");

-- CreateIndex
CREATE INDEX "organization_members_organizationId_status_idx" ON "organization_members"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_connections_clientId_key" ON "partner_connections"("clientId");

-- CreateIndex
CREATE INDEX "partner_connections_organizationId_status_idx" ON "partner_connections"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_connections_organizationId_name_key" ON "partner_connections"("organizationId", "name");

-- CreateIndex
CREATE INDEX "partner_signing_keys_partnerConnectionId_status_idx" ON "partner_signing_keys"("partnerConnectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_signing_keys_partnerConnectionId_kid_key" ON "partner_signing_keys"("partnerConnectionId", "kid");

-- CreateIndex
CREATE INDEX "audit_events_organizationId_occurredAt_idx" ON "audit_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_correlationId_idx" ON "audit_events"("correlationId");

-- CreateIndex
CREATE INDEX "audit_events_resourceType_resourceId_idx" ON "audit_events"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_events_action_occurredAt_idx" ON "audit_events"("action", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_expiresAt_idx" ON "audit_events"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_chainKey_sequence_key" ON "audit_events"("chainKey", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hashSelf_key" ON "audit_events"("hashSelf");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "outbox_events_correlationId_idx" ON "outbox_events"("correlationId");

-- CreateIndex
CREATE INDEX "inbox_events_expiresAt_idx" ON "inbox_events"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_source_externalId_key" ON "inbox_events"("source", "externalId");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_organizationId_scope_key_key" ON "idempotency_keys"("organizationId", "scope", "key");

-- CreateIndex
CREATE INDEX "retention_policies_status_resourceType_idx" ON "retention_policies"("status", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_organizationId_resourceType_purpose_vers_key" ON "retention_policies"("organizationId", "resourceType", "purpose", "version");

-- CreateIndex
CREATE INDEX "retention_runs_retentionPolicyId_startedAt_idx" ON "retention_runs"("retentionPolicyId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_connections" ADD CONSTRAINT "partner_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_signing_keys" ADD CONSTRAINT "partner_signing_keys_partnerConnectionId_fkey" FOREIGN KEY ("partnerConnectionId") REFERENCES "partner_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "retention_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
