-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- Preserve existing auth accounts and bind each provider identity to its user's account type.
ALTER TABLE "user_auth_accounts" DROP CONSTRAINT "user_auth_accounts_userId_fkey";
DROP INDEX "user_auth_accounts_provider_providerAccountId_key";
ALTER TABLE "user_auth_accounts" ADD COLUMN "accountType" "AccountType";
UPDATE "user_auth_accounts" AS account
SET "accountType" = users."accountType"
FROM "users" AS users
WHERE users."id" = account."userId";
ALTER TABLE "user_auth_accounts" ALTER COLUMN "accountType" SET NOT NULL;

-- CreateTable
CREATE TABLE "admin_login_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'VENDOR',
    "applicationStatus" "VendorApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "businessName" VARCHAR(200),
    "storeName" VARCHAR(120),
    "businessType" VARCHAR(100),
    "description" VARCHAR(2000),
    "contactName" VARCHAR(160),
    "phone" VARCHAR(32),
    "country" VARCHAR(100),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "address" VARCHAR(300),
    "marketAssociation" VARCHAR(200),
    "submittedAt" TIMESTAMPTZ(6),
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedById" UUID,
    "rejectionReason" VARCHAR(1000),
    "informationRequest" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_login_challenges_tokenHash_key" ON "admin_login_challenges"("tokenHash");
CREATE INDEX "admin_login_challenges_userId_expiresAt_idx" ON "admin_login_challenges"("userId", "expiresAt");
CREATE INDEX "admin_login_challenges_expiresAt_idx" ON "admin_login_challenges"("expiresAt");
CREATE UNIQUE INDEX "vendor_profiles_userId_key" ON "vendor_profiles"("userId");
CREATE INDEX "vendor_profiles_applicationStatus_submittedAt_idx" ON "vendor_profiles"("applicationStatus", "submittedAt");
CREATE INDEX "vendor_profiles_reviewedById_reviewedAt_idx" ON "vendor_profiles"("reviewedById", "reviewedAt");
CREATE UNIQUE INDEX "vendor_profiles_userId_accountType_key" ON "vendor_profiles"("userId", "accountType");
CREATE UNIQUE INDEX "user_auth_accounts_provider_providerAccountId_accountType_key"
    ON "user_auth_accounts"("provider", "providerAccountId", "accountType");
CREATE UNIQUE INDEX "users_id_accountType_key" ON "users"("id", "accountType");

-- Keep the denormalized role columns consistent with their owning records.
ALTER TABLE "user_auth_accounts"
    ADD CONSTRAINT "user_auth_accounts_amazon_account_type_check"
    CHECK ("provider" <> 'AMAZON' OR "accountType" IN ('CUSTOMER', 'VENDOR'));
ALTER TABLE "vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_account_type_check"
    CHECK ("accountType" = 'VENDOR');

-- AddForeignKey
ALTER TABLE "user_auth_accounts"
    ADD CONSTRAINT "user_auth_accounts_userId_accountType_fkey"
    FOREIGN KEY ("userId", "accountType") REFERENCES "users"("id", "accountType")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_login_challenges"
    ADD CONSTRAINT "admin_login_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_userId_accountType_fkey"
    FOREIGN KEY ("userId", "accountType") REFERENCES "users"("id", "accountType")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_profiles"
    ADD CONSTRAINT "vendor_profiles_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
