-- CreateEnum
CREATE TYPE "TelecomCaseAssessment" AS ENUM ('SCAM', 'LEGITIMATE', 'UNCLEAR');

-- CreateTable
CREATE TABLE "telecom_case_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "assessment" "TelecomCaseAssessment" NOT NULL,
    "note" TEXT,
    "correlationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telecom_case_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telecom_case_feedback_caseId_idx" ON "telecom_case_feedback"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "telecom_case_feedback_organizationId_caseId_key" ON "telecom_case_feedback"("organizationId", "caseId");

-- AddForeignKey
ALTER TABLE "telecom_case_feedback" ADD CONSTRAINT "telecom_case_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telecom_case_feedback" ADD CONSTRAINT "telecom_case_feedback_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "correlation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
