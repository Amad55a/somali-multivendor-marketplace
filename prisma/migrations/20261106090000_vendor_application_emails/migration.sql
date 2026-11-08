CREATE TYPE "VendorApplicationEmailEvent" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

CREATE TABLE "vendor_application_emails" (
    "id" UUID NOT NULL,
    "vendorProfileId" UUID NOT NULL,
    "event" "VendorApplicationEmailEvent" NOT NULL,
    "recipientEmail" VARCHAR(254) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMPTZ(6),
    "lastAttemptAt" TIMESTAMPTZ(6),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vendor_application_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_application_emails_vendorProfileId_event_key" ON "vendor_application_emails"("vendorProfileId", "event");
CREATE INDEX "vendor_application_emails_sentAt_lastAttemptAt_idx" ON "vendor_application_emails"("sentAt", "lastAttemptAt");
ALTER TABLE "vendor_application_emails" ADD CONSTRAINT "vendor_application_emails_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
