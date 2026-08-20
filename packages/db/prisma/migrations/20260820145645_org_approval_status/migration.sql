-- CreateEnum
CREATE TYPE "OrganizationApprovalStatus" AS ENUM ('SANDBOX', 'PENDING_REVIEW', 'NEEDS_CONTACT', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "approvalStatus" "OrganizationApprovalStatus" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "approvalUpdatedAt" TIMESTAMP(3);

-- Grandfather every organization that existed before go-live gating was introduced: they were
-- already operating, so they are APPROVED. New self-service signups get SANDBOX via the default.
UPDATE "organizations" SET "approvalStatus" = 'APPROVED', "approvalUpdatedAt" = now();
