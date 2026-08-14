-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationAction" AS ENUM ('ALLOW', 'WARN', 'REQUIRE_CALLBACK', 'REQUIRE_ANALYST_REVIEW', 'DELAY', 'BLOCK_RECOMMENDED');

-- CreateEnum
CREATE TYPE "EvidenceAvailability" AS ENUM ('OK', 'OK_NO_SIGNALS', 'NO_CONSENT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CallerReputation" AS ENUM ('UNKNOWN', 'TRUSTED', 'SUSPECT', 'KNOWN_BAD');

-- CreateEnum
CREATE TYPE "IdentityVerificationResult" AS ENUM ('PASS', 'FAIL', 'NOT_CHECKED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'RECOMMENDED', 'AWAITING_OUTCOME', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BankDecision" AS ENUM ('ALLOWED', 'DELAYED', 'BLOCKED', 'CALLBACK_REQUESTED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "OutcomeClassification" AS ENUM ('PENDING', 'CONFIRMED_SCAM', 'FALSE_POSITIVE', 'LEGITIMATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED_DUPLICATE');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationalEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "purpose" "Purpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "scope" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telecom_risk_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "purpose" "Purpose" NOT NULL DEFAULT 'PROTECT_PAYMENT',
    "eventType" TEXT NOT NULL,
    "recentSuspiciousCall" BOOLEAN NOT NULL DEFAULT false,
    "callerReputation" "CallerReputation" NOT NULL DEFAULT 'UNKNOWN',
    "callDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "deviceChange" BOOLEAN NOT NULL DEFAULT false,
    "accountTakeoverIndicators" BOOLEAN NOT NULL DEFAULT false,
    "scamCampaignMatch" BOOLEAN NOT NULL DEFAULT false,
    "telecomEvidence" "EvidenceAvailability" NOT NULL DEFAULT 'OK',
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "telecom_risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "payeeRef" TEXT,
    "purpose" "Purpose" NOT NULL DEFAULT 'PROTECT_PAYMENT',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "firstTimePayee" BOOLEAN NOT NULL DEFAULT false,
    "payeeAgeDays" INTEGER NOT NULL DEFAULT 0,
    "paymentVelocity24h" INTEGER NOT NULL DEFAULT 0,
    "deviceChange" BOOLEAN NOT NULL DEFAULT false,
    "accountTakeoverIndicators" BOOLEAN NOT NULL DEFAULT false,
    "customerVulnerability" BOOLEAN NOT NULL DEFAULT false,
    "identityVerificationResult" "IdentityVerificationResult" NOT NULL DEFAULT 'NOT_CHECKED',
    "previousWarnings" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlation_cases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "telecomRiskEventId" TEXT,
    "paymentIntentId" TEXT,
    "correlationBasis" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "correlation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "uncertainty" DECIMAL(4,3) NOT NULL,
    "reasonCodes" TEXT[],
    "contributingSignals" JSONB NOT NULL,
    "rulesTriggered" TEXT[],
    "evidenceSources" JSONB NOT NULL,
    "missingProviders" TEXT[],
    "telecomEvidence" "EvidenceAvailability" NOT NULL DEFAULT 'OK',
    "policyVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "processingTimeMs" INTEGER NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "riskAssessmentId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "recommendedAction" "RecommendationAction" NOT NULL,
    "alternativeActions" "RecommendationAction"[],
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "uncertainty" DECIMAL(4,3) NOT NULL,
    "reasonCodes" TEXT[],
    "summary" TEXT NOT NULL,
    "authorityNote" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_outcomes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "bankDecision" "BankDecision" NOT NULL,
    "outcomeClassification" "OutcomeClassification" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeRecordedAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "bank_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT,
    "subjectRef" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "notificationType" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "providerRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "purpose" "Purpose" NOT NULL DEFAULT 'PROTECT_PAYMENT',
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "status" "OperationalEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "actor" TEXT NOT NULL,
    "subjectRef" TEXT,
    "provider" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "durationMs" INTEGER,
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "payloadPreview" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_records_organizationId_status_idx" ON "consent_records"("organizationId", "status");

-- CreateIndex
CREATE INDEX "consent_records_subjectRef_idx" ON "consent_records"("subjectRef");

-- CreateIndex
CREATE INDEX "consent_records_expiresAt_idx" ON "consent_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_organizationId_subjectRef_purpose_key" ON "consent_records"("organizationId", "subjectRef", "purpose");

-- CreateIndex
CREATE INDEX "telecom_risk_events_organizationId_observedAt_idx" ON "telecom_risk_events"("organizationId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "telecom_risk_events_subjectRef_idx" ON "telecom_risk_events"("subjectRef");

-- CreateIndex
CREATE INDEX "telecom_risk_events_correlationId_idx" ON "telecom_risk_events"("correlationId");

-- CreateIndex
CREATE INDEX "telecom_risk_events_scamCampaignMatch_idx" ON "telecom_risk_events"("scamCampaignMatch");

-- CreateIndex
CREATE INDEX "telecom_risk_events_expiresAt_idx" ON "telecom_risk_events"("expiresAt");

-- CreateIndex
CREATE INDEX "payment_intents_organizationId_initiatedAt_idx" ON "payment_intents"("organizationId", "initiatedAt" DESC);

-- CreateIndex
CREATE INDEX "payment_intents_subjectRef_idx" ON "payment_intents"("subjectRef");

-- CreateIndex
CREATE INDEX "payment_intents_correlationId_idx" ON "payment_intents"("correlationId");

-- CreateIndex
CREATE INDEX "payment_intents_expiresAt_idx" ON "payment_intents"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "correlation_cases_telecomRiskEventId_key" ON "correlation_cases"("telecomRiskEventId");

-- CreateIndex
CREATE UNIQUE INDEX "correlation_cases_paymentIntentId_key" ON "correlation_cases"("paymentIntentId");

-- CreateIndex
CREATE INDEX "correlation_cases_organizationId_status_openedAt_idx" ON "correlation_cases"("organizationId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "correlation_cases_subjectRef_idx" ON "correlation_cases"("subjectRef");

-- CreateIndex
CREATE INDEX "correlation_cases_correlationId_idx" ON "correlation_cases"("correlationId");

-- CreateIndex
CREATE INDEX "correlation_cases_expiresAt_idx" ON "correlation_cases"("expiresAt");

-- CreateIndex
CREATE INDEX "risk_assessments_caseId_evaluatedAt_idx" ON "risk_assessments"("caseId", "evaluatedAt" DESC);

-- CreateIndex
CREATE INDEX "risk_assessments_organizationId_evaluatedAt_idx" ON "risk_assessments"("organizationId", "evaluatedAt" DESC);

-- CreateIndex
CREATE INDEX "risk_assessments_riskLevel_idx" ON "risk_assessments"("riskLevel");

-- CreateIndex
CREATE INDEX "risk_assessments_correlationId_idx" ON "risk_assessments"("correlationId");

-- CreateIndex
CREATE INDEX "risk_assessments_expiresAt_idx" ON "risk_assessments"("expiresAt");

-- CreateIndex
CREATE INDEX "recommendations_caseId_issuedAt_idx" ON "recommendations"("caseId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "recommendations_organizationId_issuedAt_idx" ON "recommendations"("organizationId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "recommendations_recommendedAction_idx" ON "recommendations"("recommendedAction");

-- CreateIndex
CREATE INDEX "recommendations_riskLevel_idx" ON "recommendations"("riskLevel");

-- CreateIndex
CREATE INDEX "recommendations_correlationId_idx" ON "recommendations"("correlationId");

-- CreateIndex
CREATE INDEX "recommendations_expiresAt_idx" ON "recommendations"("expiresAt");

-- CreateIndex
CREATE INDEX "bank_outcomes_organizationId_decidedAt_idx" ON "bank_outcomes"("organizationId", "decidedAt" DESC);

-- CreateIndex
CREATE INDEX "bank_outcomes_outcomeClassification_idx" ON "bank_outcomes"("outcomeClassification");

-- CreateIndex
CREATE INDEX "bank_outcomes_correlationId_idx" ON "bank_outcomes"("correlationId");

-- CreateIndex
CREATE INDEX "bank_outcomes_expiresAt_idx" ON "bank_outcomes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_outcomes_organizationId_caseId_key" ON "bank_outcomes"("organizationId", "caseId");

-- CreateIndex
CREATE INDEX "notification_records_organizationId_createdAt_idx" ON "notification_records"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notification_records_caseId_idx" ON "notification_records"("caseId");

-- CreateIndex
CREATE INDEX "notification_records_status_idx" ON "notification_records"("status");

-- CreateIndex
CREATE INDEX "notification_records_correlationId_idx" ON "notification_records"("correlationId");

-- CreateIndex
CREATE INDEX "notification_records_expiresAt_idx" ON "notification_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_records_organizationId_dedupeKey_key" ON "notification_records"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "operational_events_occurredAt_idx" ON "operational_events"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "operational_events_type_idx" ON "operational_events"("type");

-- CreateIndex
CREATE INDEX "operational_events_severity_idx" ON "operational_events"("severity");

-- CreateIndex
CREATE INDEX "operational_events_status_idx" ON "operational_events"("status");

-- CreateIndex
CREATE INDEX "operational_events_provider_idx" ON "operational_events"("provider");

-- CreateIndex
CREATE INDEX "operational_events_correlationId_idx" ON "operational_events"("correlationId");

-- CreateIndex
CREATE INDEX "operational_events_organizationId_occurredAt_idx" ON "operational_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "operational_events_expiresAt_idx" ON "operational_events"("expiresAt");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecom_risk_events" ADD CONSTRAINT "telecom_risk_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_cases" ADD CONSTRAINT "correlation_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_cases" ADD CONSTRAINT "correlation_cases_telecomRiskEventId_fkey" FOREIGN KEY ("telecomRiskEventId") REFERENCES "telecom_risk_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlation_cases" ADD CONSTRAINT "correlation_cases_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "correlation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "correlation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_outcomes" ADD CONSTRAINT "bank_outcomes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_outcomes" ADD CONSTRAINT "bank_outcomes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "correlation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_outcomes" ADD CONSTRAINT "bank_outcomes_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "correlation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_events" ADD CONSTRAINT "operational_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
