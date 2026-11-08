CREATE TYPE "SupportTicketCategory" AS ENUM (
  'ORDERS',
  'PAYMENTS',
  'DELIVERY',
  'RETURNS',
  'REFUNDS',
  'ACCOUNT',
  'PRODUCT_ISSUES',
  'SAFETY',
  'VENDOR_APPLICATION',
  'STORE_PROFILE',
  'PRODUCT_LISTING',
  'INVENTORY',
  'COUPONS',
  'COMMISSION_PAYOUTS',
  'ACCOUNT_SECURITY',
  'OTHER'
);

CREATE TYPE "SupportTicketStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_VENDOR',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "SupportTicketActivityType" AS ENUM (
  'CREATED',
  'MESSAGE_ADDED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'INTERNAL_NOTE_ADDED'
);

ALTER TABLE "customer_notifications"
  ADD COLUMN "dedupeKey" VARCHAR(160);
ALTER TABLE "vendor_notifications"
  ADD COLUMN "dedupeKey" VARCHAR(160);
ALTER TABLE "admin_notifications"
  ADD COLUMN "dedupeKey" VARCHAR(160);

CREATE UNIQUE INDEX "customer_notifications_dedupeKey_key"
  ON "customer_notifications"("dedupeKey");
CREATE UNIQUE INDEX "vendor_notifications_dedupeKey_key"
  ON "vendor_notifications"("dedupeKey");
CREATE UNIQUE INDEX "admin_notifications_dedupeKey_key"
  ON "admin_notifications"("dedupeKey");

CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL,
  "reference" VARCHAR(32) NOT NULL,
  "requesterId" UUID NOT NULL,
  "requesterRole" "AccountType" NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "description" VARCHAR(4000) NOT NULL,
  "category" "SupportTicketCategory" NOT NULL,
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" UUID,
  "relatedOrderId" UUID,
  "vendorProfileId" UUID,
  "productId" UUID,
  "idempotencyKey" VARCHAR(80),
  "resolvedAt" TIMESTAMPTZ(6),
  "closedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_tickets_requesterId_requesterRole_fkey"
    FOREIGN KEY ("requesterId", "requesterRole")
    REFERENCES "users"("id", "accountType") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_tickets_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_tickets_relatedOrderId_fkey"
    FOREIGN KEY ("relatedOrderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_tickets_vendorProfileId_fkey"
    FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_tickets_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");
CREATE UNIQUE INDEX "support_tickets_requesterId_idempotencyKey_key"
  ON "support_tickets"("requesterId", "idempotencyKey");
CREATE INDEX "support_tickets_requesterId_requesterRole_updatedAt_idx"
  ON "support_tickets"("requesterId", "requesterRole", "updatedAt");
CREATE INDEX "support_tickets_requesterRole_status_priority_updatedAt_idx"
  ON "support_tickets"("requesterRole", "status", "priority", "updatedAt");
CREATE INDEX "support_tickets_assignedToId_status_updatedAt_idx"
  ON "support_tickets"("assignedToId", "status", "updatedAt");
CREATE INDEX "support_tickets_relatedOrderId_idx" ON "support_tickets"("relatedOrderId");
CREATE INDEX "support_tickets_vendorProfileId_idx" ON "support_tickets"("vendorProfileId");
CREATE INDEX "support_tickets_productId_idx" ON "support_tickets"("productId");

CREATE TABLE "support_messages" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "senderRole" "AccountType" NOT NULL,
  "content" VARCHAR(4000) NOT NULL,
  "internalNote" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" VARCHAR(80),
  "requesterReadAt" TIMESTAMPTZ(6),
  "staffReadAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_messages_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "support_messages_senderId_idempotencyKey_key"
  ON "support_messages"("senderId", "idempotencyKey");
CREATE INDEX "support_messages_ticketId_createdAt_idx"
  ON "support_messages"("ticketId", "createdAt");
CREATE INDEX "support_messages_ticketId_internalNote_createdAt_idx"
  ON "support_messages"("ticketId", "internalNote", "createdAt");
CREATE INDEX "support_messages_ticketId_senderRole_requesterReadAt_staffReadAt_idx"
  ON "support_messages"("ticketId", "senderRole", "requesterReadAt", "staffReadAt");

CREATE TABLE "support_attachments" (
  "id" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" UUID NOT NULL,
  "idempotencyKey" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_attachments_sizeBytes_check"
    CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  CONSTRAINT "support_attachments_mimeType_check"
    CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "support_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "support_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "support_attachments_storageKey_key"
  ON "support_attachments"("storageKey");
CREATE UNIQUE INDEX "support_attachments_uploadedById_idempotencyKey_key"
  ON "support_attachments"("uploadedById", "idempotencyKey");
CREATE INDEX "support_attachments_messageId_createdAt_idx"
  ON "support_attachments"("messageId", "createdAt");
CREATE INDEX "support_attachments_uploadedById_createdAt_idx"
  ON "support_attachments"("uploadedById", "createdAt");

CREATE TABLE "support_ticket_activities" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "actorId" UUID,
  "actorRole" "AccountType",
  "type" "SupportTicketActivityType" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_ticket_activities_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_ticket_activities_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "support_ticket_activities_ticketId_createdAt_idx"
  ON "support_ticket_activities"("ticketId", "createdAt");
CREATE INDEX "support_ticket_activities_actorId_createdAt_idx"
  ON "support_ticket_activities"("actorId", "createdAt");
