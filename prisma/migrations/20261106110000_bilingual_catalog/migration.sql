ALTER TABLE "categories"
  ADD COLUMN "nameSo" VARCHAR(120),
  ADD COLUMN "descriptionSo" VARCHAR(500),
  ADD COLUMN "parentId" UUID;

ALTER TABLE "products"
  ADD COLUMN "nameSo" VARCHAR(200),
  ADD COLUMN "descriptionSo" VARCHAR(4000);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "categories_parentId_isActive_idx" ON "categories"("parentId", "isActive");
