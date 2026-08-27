-- CreateEnum
CREATE TYPE "ProtectionVerdict" AS ENUM ('PROCEED', 'WARN', 'HOLD');

-- CreateEnum
CREATE TYPE "SessionOutcome" AS ENUM ('SENT', 'ABANDONED', 'HELD', 'BLOCKED');

-- CreateTable
CREATE TABLE "protection_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "caseReference" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "verdict" "ProtectionVerdict" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "reasonCodes" TEXT[],
    "answers" JSONB,
    "outcome" "SessionOutcome",
    "confirmedScam" BOOLEAN,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "protection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_outcome_stats" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "signalKey" TEXT NOT NULL,
    "observedCount" INTEGER NOT NULL DEFAULT 0,
    "scamCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_outcome_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protection_sessions_organizationId_createdAt_idx" ON "protection_sessions"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "protection_sessions_subjectRef_idx" ON "protection_sessions"("subjectRef");

-- CreateIndex
CREATE INDEX "protection_sessions_caseReference_idx" ON "protection_sessions"("caseReference");

-- CreateIndex
CREATE INDEX "signal_outcome_stats_signalKey_idx" ON "signal_outcome_stats"("signalKey");

-- CreateIndex
CREATE UNIQUE INDEX "signal_outcome_stats_organizationId_signalKey_key" ON "signal_outcome_stats"("organizationId", "signalKey");

-- AddForeignKey
ALTER TABLE "protection_sessions" ADD CONSTRAINT "protection_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
