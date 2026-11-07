ALTER TYPE "VendorOrderStatus" ADD VALUE 'PACKED';

CREATE TYPE "SimulatedPaymentMethod" AS ENUM ('EVC_PLUS', 'ZAAD', 'EDAHAB');
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');
CREATE TYPE "CouponScope" AS ENUM ('VENDOR', 'PLATFORM');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'VENDOR_APPROVED', 'VENDOR_REJECTED', 'ESCALATED', 'ADMIN_APPROVED', 'ADMIN_REJECTED', 'RETURNED', 'RECEIVED', 'REFUNDED');
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'COMMISSION', 'VENDOR_DISCOUNT', 'REFUND', 'PAYOUT', 'ADJUSTMENT');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'SIMULATED_PAID');

ALTER TABLE "vendor_profiles" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "capturedPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "platformDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "deliveryTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "vendor_orders" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "vendor_orders" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "vendor_orders" ADD COLUMN IF NOT EXISTS "packedAt" TIMESTAMPTZ(6);
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "categoryId" UUID;
ALTER TABLE "payment_records" ADD COLUMN IF NOT EXISTS "method" "SimulatedPaymentMethod";
ALTER TABLE "payment_records" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(32);
ALTER TABLE "payment_records" ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_records_idempotencyKey_key" ON "payment_records"("idempotencyKey");

CREATE TABLE "customer_notifications" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "titleSo" VARCHAR(200) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "bodySo" VARCHAR(1000) NOT NULL,
  "entityType" VARCHAR(60),
  "entityId" UUID,
  "readAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_notifications_customerId_readAt_createdAt_idx" ON "customer_notifications"("customerId", "readAt", "createdAt");
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "vendor_delivery_rules" (
  "id" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "fee" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vendor_delivery_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_delivery_rules_vendorId_key" ON "vendor_delivery_rules"("vendorId");
ALTER TABLE "vendor_delivery_rules" ADD CONSTRAINT "vendor_delivery_rules_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_reservations" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "orderId" UUID,
  "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_reservations_orderId_key" ON "stock_reservations"("orderId");
CREATE INDEX "stock_reservations_customerId_status_expiresAt_idx" ON "stock_reservations"("customerId", "status", "expiresAt");
CREATE INDEX "stock_reservations_status_expiresAt_idx" ON "stock_reservations"("status", "expiresAt");
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "stock_reservation_items" (
  "id" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "stock_reservation_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_reservation_items_variantId_idx" ON "stock_reservation_items"("variantId");
ALTER TABLE "stock_reservation_items" ADD CONSTRAINT "stock_reservation_items_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "stock_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_items" ADD CONSTRAINT "stock_reservation_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_reviews" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "orderLineId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(2000),
  "photoKey" VARCHAR(500),
  "hiddenAt" TIMESTAMPTZ(6),
  "hiddenReason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_reviews_orderLineId_key" ON "product_reviews"("orderLineId");
CREATE INDEX "product_reviews_productId_hiddenAt_idx" ON "product_reviews"("productId", "hiddenAt");
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "coupons" (
  "id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "scope" "CouponScope" NOT NULL,
  "vendorId" UUID,
  "discountType" "DiscountType" NOT NULL,
  "discountValue" DECIMAL(12,2) NOT NULL,
  "minOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "totalUsageLimit" INTEGER,
  "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE INDEX "coupons_scope_isActive_endsAt_idx" ON "coupons"("scope", "isActive", "endsAt");
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coupon_redemptions" (
  "id" UUID NOT NULL,
  "couponId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupon_redemptions_couponId_orderId_key" ON "coupon_redemptions"("couponId", "orderId");
CREATE INDEX "coupon_redemptions_couponId_customerId_idx" ON "coupon_redemptions"("couponId", "customerId");
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "return_requests" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "orderLineId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" VARCHAR(200) NOT NULL,
  "explanation" VARCHAR(2000) NOT NULL,
  "photoKey" VARCHAR(500),
  "vendorNote" VARCHAR(1000),
  "adminNote" VARCHAR(1000),
  "reviewedByVendorAt" TIMESTAMPTZ(6),
  "reviewedByAdminAt" TIMESTAMPTZ(6),
  "reviewedByAdminId" UUID,
  "receivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "return_requests_orderLineId_key" ON "return_requests"("orderLineId");
CREATE INDEX "return_requests_vendorId_status_idx" ON "return_requests"("vendorId", "status");
CREATE INDEX "return_requests_customerId_createdAt_idx" ON "return_requests"("customerId", "createdAt");
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "simulated_refunds" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "vendorOrderId" UUID,
  "returnId" UUID,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" VARCHAR(80) NOT NULL,
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulated_refunds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "simulated_refunds_returnId_key" ON "simulated_refunds"("returnId");
CREATE UNIQUE INDEX "simulated_refunds_vendorOrderId_reason_key" ON "simulated_refunds"("vendorOrderId", "reason");
ALTER TABLE "simulated_refunds" ADD CONSTRAINT "simulated_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulated_refunds" ADD CONSTRAINT "simulated_refunds_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulated_refunds" ADD CONSTRAINT "simulated_refunds_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "category_commissions" (
  "id" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "category_commissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "category_commissions_categoryId_key" ON "category_commissions"("categoryId");
ALTER TABLE "category_commissions" ADD CONSTRAINT "category_commissions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "vendor_payouts" (
  "id" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "periodStart" TIMESTAMPTZ(6) NOT NULL,
  "periodEnd" TIMESTAMPTZ(6) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'SIMULATED_PAID',
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vendor_payouts_vendorId_createdAt_idx" ON "vendor_payouts"("vendorId", "createdAt");
ALTER TABLE "vendor_payouts" ADD CONSTRAINT "vendor_payouts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ledger_entries" (
  "id" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "vendorOrderId" UUID,
  "payoutId" UUID,
  "type" "LedgerEntryType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key" ON "ledger_entries"("idempotencyKey");
CREATE INDEX "ledger_entries_vendorId_createdAt_idx" ON "ledger_entries"("vendorId", "createdAt");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "vendor_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
