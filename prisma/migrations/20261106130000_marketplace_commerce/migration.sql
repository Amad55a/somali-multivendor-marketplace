CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'FULFILLING', 'COMPLETED');
CREATE TYPE "VendorOrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentMode" AS ENUM ('SIMULATED');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REVERSED');

CREATE TABLE "shopping_carts" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "guestKey" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "shopping_carts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shopping_carts_userId_key" ON "shopping_carts"("userId");
CREATE UNIQUE INDEX "shopping_carts_guestKey_key" ON "shopping_carts"("guestKey");
ALTER TABLE "shopping_carts" ADD CONSTRAINT "shopping_carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cart_items" (
  "id" UUID NOT NULL,
  "cartId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cart_items_cartId_variantId_key" ON "cart_items"("cartId", "variantId");
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "shopping_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketplace_orders" (
  "id" UUID NOT NULL,
  "orderNumber" VARCHAR(24) NOT NULL,
  "customerId" UUID NOT NULL,
  "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "subtotalAmount" DECIMAL(12,2) NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "contactName" VARCHAR(160) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(32) NOT NULL,
  "country" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "district" VARCHAR(100),
  "address" VARCHAR(300) NOT NULL,
  "instructions" VARCHAR(1000),
  "paymentMode" "PaymentMode" NOT NULL DEFAULT 'SIMULATED',
  "paymentStatus" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_orders_orderNumber_key" ON "marketplace_orders"("orderNumber");
CREATE INDEX "marketplace_orders_customerId_createdAt_idx" ON "marketplace_orders"("customerId", "createdAt");
CREATE INDEX "marketplace_orders_status_createdAt_idx" ON "marketplace_orders"("status", "createdAt");
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vendor_orders" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "status" "VendorOrderStatus" NOT NULL DEFAULT 'NEW',
  "subtotalAmount" DECIMAL(12,2) NOT NULL,
  "confirmBy" TIMESTAMPTZ(6) NOT NULL,
  "confirmedAt" TIMESTAMPTZ(6),
  "courier" VARCHAR(160),
  "trackingNumber" VARCHAR(120),
  "expectedDelivery" TIMESTAMPTZ(6),
  "deliveryNote" VARCHAR(1000),
  "deliveredAt" TIMESTAMPTZ(6),
  "deliveredBy" VARCHAR(40),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vendor_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vendor_orders_vendorId_status_createdAt_idx" ON "vendor_orders"("vendorId", "status", "createdAt");
CREATE INDEX "vendor_orders_status_confirmBy_idx" ON "vendor_orders"("status", "confirmBy");
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_lines" (
  "id" UUID NOT NULL,
  "vendorOrderId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "productName" VARCHAR(200) NOT NULL,
  "productNameSo" VARCHAR(200),
  "variantName" VARCHAR(160) NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "imageId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_records" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "mode" "PaymentMode" NOT NULL DEFAULT 'SIMULATED',
  "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "simulatedOutcome" VARCHAR(20),
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_records_orderId_key" ON "payment_records"("orderId");
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "vendor_notifications" (
  "id" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "titleSo" VARCHAR(200) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "bodySo" VARCHAR(1000) NOT NULL,
  "entityType" VARCHAR(60),
  "entityId" UUID,
  "readAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vendor_notifications_vendorId_readAt_createdAt_idx" ON "vendor_notifications"("vendorId", "readAt", "createdAt");
ALTER TABLE "vendor_notifications" ADD CONSTRAINT "vendor_notifications_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
