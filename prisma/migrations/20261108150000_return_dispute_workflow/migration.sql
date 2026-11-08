ALTER TYPE "ReturnRequestStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

ALTER TABLE "return_requests"
  ADD COLUMN IF NOT EXISTS "disputeResolution" VARCHAR(40);

CREATE TABLE "return_dispute_updates" (
  "id" UUID NOT NULL,
  "returnRequestId" UUID NOT NULL,
  "authorRole" "AccountType" NOT NULL,
  "audience" VARCHAR(20) NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "requestedFrom" VARCHAR(20),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_dispute_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "return_dispute_updates_returnRequestId_createdAt_idx"
  ON "return_dispute_updates"("returnRequestId", "createdAt");
CREATE INDEX "return_dispute_updates_returnRequestId_audience_createdAt_idx"
  ON "return_dispute_updates"("returnRequestId", "audience", "createdAt");

ALTER TABLE "return_dispute_updates"
  ADD CONSTRAINT "return_dispute_updates_returnRequestId_fkey"
  FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
