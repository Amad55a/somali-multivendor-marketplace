CREATE TABLE "admin_notifications" (
  "id" UUID NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "titleSo" VARCHAR(200) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "bodySo" VARCHAR(1000) NOT NULL,
  "href" VARCHAR(300),
  "entityType" VARCHAR(60),
  "entityId" UUID,
  "readAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_notifications_readAt_createdAt_idx" ON "admin_notifications"("readAt", "createdAt");
