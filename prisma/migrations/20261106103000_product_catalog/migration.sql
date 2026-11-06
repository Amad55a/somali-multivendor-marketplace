CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED', 'REFURBISHED');

CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "description" VARCHAR(500),
  "imageKey" VARCHAR(500),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_isActive_name_idx" ON "categories"("isActive", "name");

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(240) NOT NULL,
  "description" VARCHAR(4000),
  "brand" VARCHAR(120),
  "condition" "ProductCondition",
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "marketAssociation" VARCHAR(200),
  "country" VARCHAR(100),
  "region" VARCHAR(100),
  "city" VARCHAR(100),
  "marketName" VARCHAR(160),
  "publishedAt" TIMESTAMPTZ(6),
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_vendorId_slug_key" ON "products"("vendorId", "slug");
CREATE INDEX "products_status_publishedAt_idx" ON "products"("status", "publishedAt");
CREATE INDEX "products_categoryId_status_idx" ON "products"("categoryId", "status");
CREATE INDEX "products_country_region_city_status_idx" ON "products"("country", "region", "city", "status");
ALTER TABLE "products" ADD CONSTRAINT "products_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_variants" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "variantName" VARCHAR(160) NOT NULL,
  "attributes" JSONB,
  "price" DECIMAL(12,2) NOT NULL,
  "compareAtPrice" DECIMAL(12,2),
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_productId_isActive_idx" ON "product_variants"("productId", "isActive");
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "product_images" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "vendorId" UUID NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_images_storageKey_key" ON "product_images"("storageKey");
CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");
CREATE INDEX "product_images_vendorId_productId_idx" ON "product_images"("vendorId", "productId");
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
