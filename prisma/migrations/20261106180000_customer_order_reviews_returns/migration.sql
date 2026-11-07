ALTER TYPE "ReturnRequestStatus" ADD VALUE IF NOT EXISTS 'RETURN_SHIPPED';
ALTER TYPE "ReturnRequestStatus" ADD VALUE IF NOT EXISTS 'REFUND_PROCESSING';

ALTER TABLE "return_requests"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "returnInstructions" VARCHAR(1000),
  ADD COLUMN "escalatedAt" TIMESTAMPTZ(6),
  ADD COLUMN "returnShippedAt" TIMESTAMPTZ(6),
  ADD COLUMN "returnShipmentNote" VARCHAR(1000),
  ADD COLUMN "refundProcessedAt" TIMESTAMPTZ(6);

ALTER TABLE "customer_notifications" ADD COLUMN "href" VARCHAR(300);
ALTER TABLE "vendor_notifications" ADD COLUMN "href" VARCHAR(300);

UPDATE "return_requests" AS request
SET "quantity" = line."quantity"
FROM "order_lines" AS line
WHERE request."orderLineId" = line."id";

DROP INDEX IF EXISTS "return_requests_orderLineId_key";
DROP INDEX IF EXISTS "simulated_refunds_vendorOrderId_reason_key";

CREATE UNIQUE INDEX "simulated_refunds_vendorOrder_reason_nonreturn_key"
  ON "simulated_refunds"("vendorOrderId", "reason")
  WHERE "returnId" IS NULL;

CREATE INDEX "return_requests_orderLineId_status_idx"
  ON "return_requests"("orderLineId", "status");
CREATE INDEX "return_requests_vendorId_status_createdAt_idx"
  ON "return_requests"("vendorId", "status", "createdAt");
ALTER TABLE "return_requests"
  ADD CONSTRAINT "return_requests_quantity_check" CHECK ("quantity" > 0);
