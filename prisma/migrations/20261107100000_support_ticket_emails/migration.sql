CREATE TYPE "SupportEmailEvent" AS ENUM ('TICKET_CREATED', 'TICKET_RESOLVED');
CREATE TYPE "SupportEmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "support_tickets"
  ADD COLUMN "requesterLocale" VARCHAR(2) NOT NULL DEFAULT 'en',
  ADD CONSTRAINT "support_tickets_requesterLocale_check"
    CHECK ("requesterLocale" IN ('en', 'so'));

CREATE TABLE "support_email_deliveries" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "activityId" UUID NOT NULL,
  "event" "SupportEmailEvent" NOT NULL,
  "status" "SupportEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" VARCHAR(254) NOT NULL,
  "locale" VARCHAR(2) NOT NULL DEFAULT 'en',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ(6),
  "lastError" VARCHAR(120),
  "sentAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_email_deliveries_locale_check"
    CHECK ("locale" IN ('en', 'so')),
  CONSTRAINT "support_email_deliveries_attemptCount_check"
    CHECK ("attemptCount" >= 0),
  CONSTRAINT "support_email_deliveries_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_email_deliveries_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "support_ticket_activities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "support_email_deliveries_activityId_key"
  ON "support_email_deliveries"("activityId");
CREATE INDEX "support_email_deliveries_ticketId_createdAt_idx"
  ON "support_email_deliveries"("ticketId", "createdAt");
CREATE INDEX "support_email_deliveries_status_lastAttemptAt_idx"
  ON "support_email_deliveries"("status", "lastAttemptAt");
