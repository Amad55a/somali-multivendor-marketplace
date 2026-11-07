ALTER TABLE "user_sessions"
ADD COLUMN "refreshTokenHash" VARCHAR(255);

ALTER TABLE "user_sessions"
ADD COLUMN "refreshExpiresAt" TIMESTAMPTZ(6);

UPDATE "user_sessions"
SET "refreshExpiresAt" = "expiresAt" + INTERVAL '23 days'
WHERE "refreshExpiresAt" IS NULL;

CREATE UNIQUE INDEX "user_sessions_refreshTokenHash_key"
ON "user_sessions"("refreshTokenHash");
