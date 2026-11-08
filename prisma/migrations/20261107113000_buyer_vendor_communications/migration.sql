CREATE TYPE "ConversationMessageType" AS ENUM ('TEXT', 'PRODUCT', 'ORDER', 'IMAGE', 'SYSTEM');
CREATE TYPE "CommunicationReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'FRAUD', 'IMPERSONATION', 'INAPPROPRIATE_CONTENT', 'OTHER');
CREATE TYPE "CommunicationReportStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'DISMISSED', 'ACTIONED');
CREATE TYPE "ConversationCallType" AS ENUM ('AUDIO', 'VIDEO');
CREATE TYPE "ConversationCallStatus" AS ENUM ('RINGING', 'ACCEPTED', 'REJECTED', 'ENDED', 'MISSED', 'FAILED');
CREATE TYPE "ConversationCallEventType" AS ENUM ('STARTED', 'ACCEPTED', 'REJECTED', 'ENDED', 'MISSED', 'FAILED');

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_vendorId_fkey" FOREIGN KEY ("vendorId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversations_customerId_vendorId_key" ON "conversations"("customerId", "vendorId");
CREATE INDEX "conversations_customerId_updatedAt_idx" ON "conversations"("customerId", "updatedAt");
CREATE INDEX "conversations_vendorId_updatedAt_idx" ON "conversations"("vendorId", "updatedAt");

CREATE TABLE "conversation_messages" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "type" "ConversationMessageType" NOT NULL DEFAULT 'TEXT',
  "content" VARCHAR(4000),
  "productId" UUID,
  "attachmentData" JSONB,
  "clientMessageId" VARCHAR(80) NOT NULL,
  "deliveredAt" TIMESTAMPTZ(6),
  "readAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_messages_senderId_fkey" FOREIGN KEY ("senderId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_messages_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversation_messages_conversationId_senderId_clientMessageId_key"
  ON "conversation_messages"("conversationId", "senderId", "clientMessageId");
CREATE UNIQUE INDEX "conversation_messages_conversationId_productId_key"
  ON "conversation_messages"("conversationId", "productId");
CREATE INDEX "conversation_messages_conversationId_createdAt_idx"
  ON "conversation_messages"("conversationId", "createdAt");
CREATE INDEX "conversation_messages_conversationId_senderId_readAt_createdAt_idx"
  ON "conversation_messages"("conversationId", "senderId", "readAt", "createdAt");

CREATE TABLE "conversation_attachments" (
  "id" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "uploadedById" UUID NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_attachments_messageId_fkey" FOREIGN KEY ("messageId")
    REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_attachments_sizeBytes_check" CHECK ("sizeBytes" > 0)
);
CREATE UNIQUE INDEX "conversation_attachments_storageKey_key" ON "conversation_attachments"("storageKey");
CREATE INDEX "conversation_attachments_messageId_createdAt_idx" ON "conversation_attachments"("messageId", "createdAt");

CREATE TABLE "communication_blocks" (
  "id" UUID NOT NULL,
  "blockerId" UUID NOT NULL,
  "blockedId" UUID NOT NULL,
  "conversationId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communication_blocks_blockerId_fkey" FOREIGN KEY ("blockerId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_blocks_blockedId_fkey" FOREIGN KEY ("blockedId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_blocks_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "communication_blocks_distinct_users_check" CHECK ("blockerId" <> "blockedId")
);
CREATE UNIQUE INDEX "communication_blocks_blockerId_blockedId_key"
  ON "communication_blocks"("blockerId", "blockedId");
CREATE INDEX "communication_blocks_blockedId_createdAt_idx"
  ON "communication_blocks"("blockedId", "createdAt");
CREATE INDEX "communication_blocks_conversationId_idx"
  ON "communication_blocks"("conversationId");

CREATE TABLE "communication_reports" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "reportedUserId" UUID NOT NULL,
  "reason" "CommunicationReportReason" NOT NULL,
  "explanation" VARCHAR(2000),
  "status" "CommunicationReportStatus" NOT NULL DEFAULT 'OPEN',
  "decisionReason" VARCHAR(1000),
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communication_reports_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_reports_reporterId_fkey" FOREIGN KEY ("reporterId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "communication_reports_distinct_users_check" CHECK ("reporterId" <> "reportedUserId")
);
CREATE UNIQUE INDEX "communication_reports_conversationId_reporterId_reportedUserId_key"
  ON "communication_reports"("conversationId", "reporterId", "reportedUserId");
CREATE INDEX "communication_reports_status_createdAt_idx"
  ON "communication_reports"("status", "createdAt");
CREATE INDEX "communication_reports_reportedUserId_status_createdAt_idx"
  ON "communication_reports"("reportedUserId", "status", "createdAt");

CREATE TABLE "conversation_calls" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "callerId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "type" "ConversationCallType" NOT NULL,
  "status" "ConversationCallStatus" NOT NULL DEFAULT 'RINGING',
  "startedAt" TIMESTAMPTZ(6),
  "endedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_calls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_calls_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_calls_callerId_fkey" FOREIGN KEY ("callerId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_calls_recipientId_fkey" FOREIGN KEY ("recipientId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_calls_distinct_users_check" CHECK ("callerId" <> "recipientId")
);
CREATE INDEX "conversation_calls_conversationId_createdAt_idx"
  ON "conversation_calls"("conversationId", "createdAt");
CREATE INDEX "conversation_calls_recipientId_status_createdAt_idx"
  ON "conversation_calls"("recipientId", "status", "createdAt");

CREATE TABLE "conversation_call_events" (
  "id" UUID NOT NULL,
  "callId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "type" "ConversationCallEventType" NOT NULL,
  "clientEventId" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_call_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_call_events_callId_fkey" FOREIGN KEY ("callId")
    REFERENCES "conversation_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_call_events_actorId_fkey" FOREIGN KEY ("actorId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversation_call_events_callId_actorId_clientEventId_key"
  ON "conversation_call_events"("callId", "actorId", "clientEventId");
CREATE INDEX "conversation_call_events_callId_createdAt_idx"
  ON "conversation_call_events"("callId", "createdAt");

CREATE TABLE "conversation_presence" (
  "conversationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_presence_pkey" PRIMARY KEY ("conversationId", "userId"),
  CONSTRAINT "conversation_presence_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_presence_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "conversation_presence_userId_heartbeatAt_idx"
  ON "conversation_presence"("userId", "heartbeatAt");
