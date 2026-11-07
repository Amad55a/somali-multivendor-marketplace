ALTER TABLE "users"
  ADD COLUMN "displayName" VARCHAR(160),
  ADD COLUMN "profileImageKey" VARCHAR(500);

ALTER TABLE "vendor_profiles"
  ADD COLUMN "mobileMoneyNumber" VARCHAR(32);

CREATE TYPE "VendorFileType" AS ENUM ('STORE_LOGO', 'BUSINESS_LICENSE');

CREATE TABLE "vendor_application_files" (
  "id" UUID NOT NULL,
  "vendorProfileId" UUID NOT NULL,
  "fileType" "VendorFileType" NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vendor_application_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_application_files_vendorProfileId_fileType_key"
  ON "vendor_application_files"("vendorProfileId", "fileType");
CREATE UNIQUE INDEX "vendor_application_files_storageKey_key"
  ON "vendor_application_files"("storageKey");
CREATE INDEX "vendor_application_files_fileType_createdAt_idx"
  ON "vendor_application_files"("fileType", "createdAt");
ALTER TABLE "vendor_application_files"
  ADD CONSTRAINT "vendor_application_files_vendorProfileId_fkey"
  FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
