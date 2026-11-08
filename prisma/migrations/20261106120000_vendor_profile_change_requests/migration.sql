-- AlterEnum
ALTER TYPE "VendorApplicationEmailEvent" ADD VALUE 'PROFILE_CHANGE_SUBMITTED';
ALTER TYPE "VendorApplicationEmailEvent" ADD VALUE 'PROFILE_CHANGE_APPROVED';
ALTER TYPE "VendorApplicationEmailEvent" ADD VALUE 'PROFILE_CHANGE_REJECTED';

-- CreateEnum
CREATE TYPE "VendorProfileChangeStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vendor_profile_change_requests" (
    "id" UUID NOT NULL,
    "vendorProfileId" UUID NOT NULL,
    "status" "VendorProfileChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "proposed" JSONB NOT NULL,
    "currentSnapshot" JSONB NOT NULL,
    "vendorNote" VARCHAR(1000),
    "adminNote" VARCHAR(1000),
    "submittedAt" TIMESTAMPTZ(6),
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profile_change_files" (
    "id" UUID NOT NULL,
    "changeRequestId" UUID NOT NULL,
    "fileType" "VendorFileType" NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_profile_change_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_profile_change_files_storageKey_key" ON "vendor_profile_change_files"("storageKey");
CREATE UNIQUE INDEX "vp_change_files_request_type_key" ON "vendor_profile_change_files"("changeRequestId", "fileType");
CREATE INDEX "vp_change_requests_profile_status_idx" ON "vendor_profile_change_requests"("vendorProfileId", "status", "submittedAt");
CREATE INDEX "vp_change_requests_status_idx" ON "vendor_profile_change_requests"("status", "submittedAt");

ALTER TABLE "vendor_profile_change_requests"
  ADD CONSTRAINT "vendor_profile_change_requests_vendorProfileId_fkey"
  FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_profile_change_requests"
  ADD CONSTRAINT "vendor_profile_change_requests_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendor_profile_change_files"
  ADD CONSTRAINT "vendor_profile_change_files_changeRequestId_fkey"
  FOREIGN KEY ("changeRequestId") REFERENCES "vendor_profile_change_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
