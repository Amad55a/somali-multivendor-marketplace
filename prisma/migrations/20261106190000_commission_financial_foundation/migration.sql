ALTER TYPE "LedgerEntryType" ADD VALUE 'PLATFORM_DISCOUNT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'DELIVERY_FEE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'REFUND_ADJUSTMENT';

ALTER TYPE "PayoutStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PayoutStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PayoutStatus" ADD VALUE 'FAILED';
ALTER TYPE "PayoutStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "category_commissions"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedById" UUID;

CREATE TABLE "commission_settings" (
  "id" VARCHAR(40) NOT NULL DEFAULT 'default',
  "defaultPercent" DECIMAL(5,2) NOT NULL,
  "updatedById" UUID,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_settings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "commission_settings" ("id", "defaultPercent") VALUES ('default', 10.00);

CREATE TABLE "category_commission_history" (
  "id" UUID NOT NULL,
  "categoryId" UUID,
  "categoryName" VARCHAR(120) NOT NULL,
  "previousPercent" DECIMAL(5,2),
  "percent" DECIMAL(5,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "changedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_commission_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "category_commission_history_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "category_commission_history_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "category_commission_history_categoryId_createdAt_idx"
  ON "category_commission_history"("categoryId", "createdAt");

ALTER TABLE "category_commissions"
  ADD CONSTRAINT "category_commissions_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_lines"
  ADD COLUMN "commissionPercent" DECIMAL(5,2),
  ADD COLUMN "commissionAmount" DECIMAL(12,2);

ALTER TABLE "coupon_redemptions"
  ADD COLUMN "vendorOrderId" UUID,
  ADD CONSTRAINT "coupon_redemptions_vendorOrderId_fkey"
    FOREIGN KEY ("vendorOrderId") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "coupon_redemptions_vendorOrderId_idx" ON "coupon_redemptions"("vendorOrderId");

CREATE TABLE "payout_batches" (
  "id" UUID NOT NULL,
  "weekKey" VARCHAR(20) NOT NULL,
  "periodStart" TIMESTAMPTZ(6) NOT NULL,
  "periodEnd" TIMESTAMPTZ(6) NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" UUID,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(6),
  "processedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_batches_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payout_batches_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payout_batches_weekKey_key" ON "payout_batches"("weekKey");
CREATE INDEX "payout_batches_status_createdAt_idx" ON "payout_batches"("status", "createdAt");

ALTER TABLE "vendor_payouts"
  ADD COLUMN "batchId" UUID,
  ADD COLUMN "reference" VARCHAR(40),
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN "idempotencyKey" VARCHAR(120),
  ADD COLUMN "approvedById" UUID,
  ADD COLUMN "approvedAt" TIMESTAMPTZ(6),
  ADD COLUMN "processedAt" TIMESTAMPTZ(6),
  ADD COLUMN "failureReason" VARCHAR(500),
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
CREATE UNIQUE INDEX "vendor_payouts_reference_key" ON "vendor_payouts"("reference");
CREATE UNIQUE INDEX "vendor_payouts_idempotencyKey_key" ON "vendor_payouts"("idempotencyKey");
CREATE UNIQUE INDEX "vendor_payouts_batchId_vendorId_currency_key" ON "vendor_payouts"("batchId", "vendorId", "currency");
ALTER TABLE "vendor_payouts"
  ADD CONSTRAINT "vendor_payouts_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "vendor_payouts_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ALTER COLUMN "vendorId" DROP NOT NULL,
  ADD COLUMN "orderId" UUID,
  ADD COLUMN "orderLineId" UUID,
  ADD COLUMN "couponId" UUID,
  ADD COLUMN "relatedEntryId" UUID,
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN "description" VARCHAR(500) NOT NULL DEFAULT 'Legacy financial record';
ALTER TABLE "ledger_entries" ALTER COLUMN "description" DROP DEFAULT;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ledger_entries_orderLineId_fkey"
    FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ledger_entries_couponId_fkey"
    FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ledger_entries_relatedEntryId_fkey"
    FOREIGN KEY ("relatedEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ledger_entries_orderId_type_idx" ON "ledger_entries"("orderId", "type");
CREATE INDEX "ledger_entries_vendorOrderId_type_idx" ON "ledger_entries"("vendorOrderId", "type");
CREATE INDEX "ledger_entries_payoutId_idx" ON "ledger_entries"("payoutId");

CREATE TABLE "payout_allocations" (
  "id" UUID NOT NULL,
  "payoutId" UUID NOT NULL,
  "ledgerEntryId" UUID NOT NULL,
  "releasedAt" TIMESTAMPTZ(6),
  "releaseReason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_allocations_payoutId_ledgerEntryId_key" UNIQUE ("payoutId", "ledgerEntryId"),
  CONSTRAINT "payout_allocations_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "vendor_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payout_allocations_ledgerEntryId_fkey"
    FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payout_allocations_ledgerEntryId_releasedAt_idx"
  ON "payout_allocations"("ledgerEntryId", "releasedAt");
CREATE INDEX "payout_allocations_payoutId_releasedAt_idx"
  ON "payout_allocations"("payoutId", "releasedAt");
CREATE UNIQUE INDEX "payout_allocations_active_ledgerEntryId_key"
  ON "payout_allocations"("ledgerEntryId")
  WHERE "releasedAt" IS NULL;
