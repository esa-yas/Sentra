-- AlterTable: fast O(1) lookup for API-key authentication (SHA-256 of the secret).
ALTER TABLE "api_keys" ADD COLUMN "secretLookup" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_secretLookup_key" ON "api_keys"("secretLookup");
