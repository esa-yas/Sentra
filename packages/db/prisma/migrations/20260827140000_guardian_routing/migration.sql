-- CreateEnum
CREATE TYPE "GuardianStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReviewRoute" AS ENUM ('NONE', 'BANK', 'GUARDIAN', 'GUARDIAN_THEN_BANK');

-- CreateTable
CREATE TABLE "protection_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "guardianEnabled" BOOLEAN NOT NULL DEFAULT true,
    "releaseCeiling" DECIMAL(18,2) NOT NULL DEFAULT 2000,
    "overrideScore" INTEGER NOT NULL DEFAULT 90,
    "windowSeconds" INTEGER NOT NULL DEFAULT 600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protection_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "reviewRoute" "ReviewRoute" NOT NULL DEFAULT 'BANK',
    "guardianLabel" TEXT NOT NULL,
    "contactRef" TEXT NOT NULL,
    "status" "GuardianStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protection_policies_organizationId_key" ON "protection_policies"("organizationId");

-- CreateIndex
CREATE INDEX "guardian_links_status_idx" ON "guardian_links"("status");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_links_organizationId_subjectRef_key" ON "guardian_links"("organizationId", "subjectRef");

-- AddForeignKey
ALTER TABLE "protection_policies" ADD CONSTRAINT "protection_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
