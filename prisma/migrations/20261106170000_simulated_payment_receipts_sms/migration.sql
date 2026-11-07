CREATE TYPE "SimulatedPaymentAttemptStatus" AS ENUM (
  'PENDING',
  'SIMULATED_SUCCESS',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);
CREATE TYPE "SmsOutboxStatus" AS ENUM (
  'QUEUED',
  'SAVED_TO_OUTBOX',
  'FAILED_TO_SAVE'
);

CREATE TABLE "simulated_payment_attempts" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "orderId" UUID,
  "method" "SimulatedPaymentMethod",
  "maskedPhone" VARCHAR(32),
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "transactionReference" VARCHAR(80),
  "status" "SimulatedPaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" VARCHAR(300),
  "provider" VARCHAR(40) NOT NULL DEFAULT 'MOCK_MOBILE_MONEY',
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "idempotencyKey" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "simulated_payment_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "simulated_payment_attempts_transactionReference_key"
  ON "simulated_payment_attempts"("transactionReference");
CREATE UNIQUE INDEX "simulated_payment_attempts_idempotencyKey_key"
  ON "simulated_payment_attempts"("idempotencyKey");
CREATE INDEX "simulated_payment_attempts_customerId_createdAt_idx"
  ON "simulated_payment_attempts"("customerId", "createdAt");
CREATE INDEX "simulated_payment_attempts_reservationId_createdAt_idx"
  ON "simulated_payment_attempts"("reservationId", "createdAt");
CREATE INDEX "simulated_payment_attempts_orderId_idx"
  ON "simulated_payment_attempts"("orderId");
ALTER TABLE "simulated_payment_attempts"
  ADD CONSTRAINT "simulated_payment_attempts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulated_payment_attempts"
  ADD CONSTRAINT "simulated_payment_attempts_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "stock_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulated_payment_attempts"
  ADD CONSTRAINT "simulated_payment_attempts_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_receipts" (
  "id" UUID NOT NULL,
  "receiptNumber" VARCHAR(32) NOT NULL,
  "orderId" UUID NOT NULL,
  "paymentAttemptId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "customerName" VARCHAR(160) NOT NULL,
  "method" "SimulatedPaymentMethod" NOT NULL,
  "maskedMobile" VARCHAR(32) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "transactionReference" VARCHAR(80) NOT NULL,
  "paidAt" TIMESTAMPTZ(6) NOT NULL,
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_receipts_receiptNumber_key" ON "payment_receipts"("receiptNumber");
CREATE UNIQUE INDEX "payment_receipts_orderId_key" ON "payment_receipts"("orderId");
CREATE UNIQUE INDEX "payment_receipts_paymentAttemptId_key" ON "payment_receipts"("paymentAttemptId");
CREATE INDEX "payment_receipts_customerId_paidAt_idx" ON "payment_receipts"("customerId", "paidAt");
ALTER TABLE "payment_receipts"
  ADD CONSTRAINT "payment_receipts_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_receipts"
  ADD CONSTRAINT "payment_receipts_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "simulated_payment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_receipts"
  ADD CONSTRAINT "payment_receipts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sms_outbox_messages" (
  "id" UUID NOT NULL,
  "recipient" VARCHAR(32) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "messageType" VARCHAR(60) NOT NULL,
  "relatedUserId" UUID,
  "orderId" UUID,
  "paymentAttemptId" UUID,
  "status" "SmsOutboxStatus" NOT NULL DEFAULT 'SAVED_TO_OUTBOX',
  "deliveryMode" VARCHAR(40) NOT NULL DEFAULT 'SIMULATED_OUTBOX',
  "error" VARCHAR(500),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sms_outbox_messages_idempotencyKey_key"
  ON "sms_outbox_messages"("idempotencyKey");
CREATE INDEX "sms_outbox_messages_recipient_createdAt_idx"
  ON "sms_outbox_messages"("recipient", "createdAt");
CREATE INDEX "sms_outbox_messages_messageType_status_createdAt_idx"
  ON "sms_outbox_messages"("messageType", "status", "createdAt");
ALTER TABLE "sms_outbox_messages"
  ADD CONSTRAINT "sms_outbox_messages_relatedUserId_fkey"
  FOREIGN KEY ("relatedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_outbox_messages"
  ADD CONSTRAINT "sms_outbox_messages_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_outbox_messages"
  ADD CONSTRAINT "sms_outbox_messages_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "simulated_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
