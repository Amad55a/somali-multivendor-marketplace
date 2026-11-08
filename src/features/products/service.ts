import type { Prisma, ProductStatus } from "../../../generated/prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import { assertApprovedVendor } from "@/features/vendors/service";
import { availableStockForVariants } from "@/features/commerce/inventory";
import { saveProductImage } from "@/lib/media/vendor-files";
import type {
  productCreateSchema,
  productUpdateSchema,
  productQuerySchema,
} from "@/features/products/validation";
import type { z } from "zod";

type ProductInput = z.infer<typeof productCreateSchema>;
type ProductUpdate = z.infer<typeof productUpdateSchema>;
type ProductQuery = z.infer<typeof productQuerySchema>;

const variantSelect = {
  id: true,
  sku: true,
  variantName: true,
  attributes: true,
  price: true,
  compareAtPrice: true,
  stockQuantity: true,
  isActive: true,
} as const;

const catalogInclude = {
  category: { select: { id: true, name: true, nameSo: true, slug: true } },
  vendor: { select: { id: true, displayName: true, email: true, vendorProfile: { select: { storeName: true, country: true, region: true, city: true, files: { where: { fileType: "STORE_LOGO" }, select: { id: true }, take: 1 } } } } },
  variants: { select: variantSelect, orderBy: { createdAt: "asc" as const } },
  images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }], select: { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, sortOrder: true, isPrimary: true } },
} satisfies Prisma.ProductInclude;

const productInclude = {
  ...catalogInclude,
  reviews: { where: { hiddenAt: null }, select: { id: true, rating: true, comment: true, photoKey: true, createdAt: true, customer: { select: { displayName: true } } }, orderBy: { createdAt: "desc" as const }, take: 20 },
} satisfies Prisma.ProductInclude;

async function getProductMetrics(productIds: string[]) {
  const metrics = new Map<string, {
    ratingAverage: number;
    reviewCount: number;
    purchaseCount: number;
    ratingDistribution: Record<number, number>;
  }>();
  if (!productIds.length) return metrics;
  const [ratings, distribution, purchases] = await Promise.all([
    prisma.productReview.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.productReview.groupBy({
      by: ["productId", "rating"],
      where: { productId: { in: productIds }, hiddenAt: null },
      _count: { _all: true },
    }),
    prisma.orderLine.findMany({
      where: {
        variant: { productId: { in: productIds } },
        vendorOrder: { is: { status: "DELIVERED", order: { is: { paymentStatus: "SUCCEEDED" } } } },
        returns: { none: { status: "REFUNDED" } },
      },
      select: { variant: { select: { productId: true } }, vendorOrder: { select: { orderId: true } } },
    }),
  ]);
  for (const rating of ratings) {
    metrics.set(rating.productId, {
      ratingAverage: rating._avg.rating ?? 0,
      reviewCount: rating._count._all,
      purchaseCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  }
  for (const rating of distribution) {
    const productMetrics = metrics.get(rating.productId);
    if (productMetrics) productMetrics.ratingDistribution[rating.rating] = rating._count._all;
  }
  const ordersByProduct = new Map<string, Set<string>>();
  for (const purchase of purchases) {
    const orders = ordersByProduct.get(purchase.variant.productId) ?? new Set<string>();
    orders.add(purchase.vendorOrder.orderId);
    ordersByProduct.set(purchase.variant.productId, orders);
  }
  for (const [productId, orders] of ordersByProduct) {
    const productMetrics = metrics.get(productId) ?? {
      ratingAverage: 0,
      reviewCount: 0,
      purchaseCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
    productMetrics.purchaseCount = orders.size;
    metrics.set(productId, productMetrics);
  }
  return metrics;
}

export async function createCategory(input: {
  name: string;
  nameSo: string;
  slug?: string;
  description?: string;
  descriptionSo?: string;
  parentId?: string | null;
  isActive?: boolean;
}) {
  const slug = input.slug?.trim() || slugify(input.name);
  return prisma.category.create({
    data: {
      name: input.name,
      nameSo: input.nameSo,
      slug,
      description: input.description,
      descriptionSo: input.descriptionSo,
      parentId: input.parentId || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateCategory(
  categoryId: string,
  input: {
    name?: string;
    nameSo?: string;
    description?: string;
    descriptionSo?: string;
    parentId?: string | null;
    isActive?: boolean;
  },
) {
  const used = await prisma.product.count({ where: { categoryId } });
  if (input.isActive === false && used > 0) {
    throw new AppError("CATEGORY_IN_USE", 409, "This category is used by products and cannot be disabled without reassignment.");
  }
  return prisma.category.update({ where: { id: categoryId }, data: input });
}

export async function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameSo: true, slug: true, description: true, descriptionSo: true, imageKey: true, isActive: true, parentId: true },
  });
}

export async function getCategory(slug: string) {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, nameSo: true, slug: true, description: true, descriptionSo: true, imageKey: true, isActive: true, parentId: true },
  });
  if (!category || !category.isActive) throw new AppError("CATEGORY_NOT_FOUND", 404, "Category not found.");
  return category;
}

function slugify(value: string) {
  const slug = value.trim().toLocaleLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "product";
}

async function uniqueSlug(vendorId: string, name: string, currentId?: string) {
  const base = slugify(name);
  let slug = base;
  for (let index = 2; ; index += 1) {
    const found = await prisma.product.findFirst({ where: { vendorId, slug, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } });
    if (!found) return slug;
    slug = `${base}-${index}`;
  }
}

export async function listVendorProducts(user: AuthenticatedUser, query: ProductQuery) {
  await assertApprovedVendor(user.id, user.accountType);
  return prisma.product.findMany({
    where: {
      vendorId: user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { brand: { contains: query.search, mode: "insensitive" } }] } : {}),
    },
    include: catalogInclude,
    orderBy: { createdAt: "desc" },
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });
}

async function validateVariants(variants: ProductInput["variants"], currentProductId?: string) {
  const skus = new Set<string>();
  for (const variant of variants) {
    const sku = variant.sku.trim().toLocaleLowerCase();
    if (skus.has(sku)) throw new AppError("DUPLICATE_SKU", 400, "Variant SKUs must be unique.");
    skus.add(sku);
  }
  const existing = await prisma.productVariant.findMany({
    where: {
      OR: variants.map((variant) => ({ sku: { equals: variant.sku, mode: "insensitive" } })),
      ...(currentProductId ? { productId: { not: currentProductId } } : {}),
    },
    select: { sku: true },
  });
  if (existing.length) {
    throw new AppError("DUPLICATE_SKU", 409, "One or more variant SKUs are already in use.");
  }
}

function baseVariant(basePrice: number | undefined, baseStockQuantity: number | undefined) {
  if (basePrice === undefined || baseStockQuantity === undefined) {
    throw new AppError("PRODUCT_BASE_INVENTORY_REQUIRED", 400, "Set a base price and stock quantity for a product without options.");
  }
  return {
    sku: `BASE-${randomBytes(16).toString("hex").toUpperCase()}`,
    variantName: "Standard",
    attributes: {},
    compareAtPrice: undefined,
    price: basePrice,
    stockQuantity: baseStockQuantity,
    isActive: true,
  };
}

function effectiveVariants(input: ProductInput) {
  return input.variants.length ? input.variants : [baseVariant(input.basePrice, input.baseStockQuantity)];
}

export async function createProduct(user: AuthenticatedUser, input: ProductInput) {
  await assertApprovedVendor(user.id, user.accountType);
  const variants = effectiveVariants(input);
  await validateVariants(variants);
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
  if (!category) throw new AppError("CATEGORY_NOT_FOUND", 404, "Category not found.");
  const slug = await uniqueSlug(user.id, input.name);
  return prisma.product.create({
    data: {
      vendorId: user.id,
      categoryId: input.categoryId,
      name: input.name,
      nameSo: input.nameSo,
      slug,
      description: input.description || null,
      descriptionSo: input.descriptionSo || null,
      brand: input.brand || null,
      condition: input.condition,
      marketAssociation: input.marketAssociation || null,
      country: input.country || null,
      region: input.region || null,
      city: input.city || null,
      marketName: input.marketName || null,
      variants: { create: variants.map((variant) => ({ ...variant, price: variant.price, compareAtPrice: variant.compareAtPrice || null })) },
    },
    include: catalogInclude,
  });
}

export async function updateProduct(user: AuthenticatedUser, productId: string, input: ProductUpdate) {
  await assertApprovedVendor(user.id, user.accountType);
  const existing = await prisma.product.findFirst({ where: { id: productId, vendorId: user.id }, select: { id: true, status: true, name: true } });
  if (!existing) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const variants = input.variants?.length
    ? input.variants
    : input.variants
      ? [baseVariant(input.basePrice, input.baseStockQuantity)]
      : undefined;
  if (variants) await validateVariants(variants, productId);
  const data: Prisma.ProductUpdateInput = {
    ...(input.categoryId ? { category: { connect: { id: input.categoryId } } } : {}),
    ...(input.name ? { name: input.name, slug: await uniqueSlug(user.id, input.name, productId) } : {}),
    ...(input.nameSo ? { nameSo: input.nameSo } : {}),
    ...(input.description !== undefined ? { description: input.description || null } : {}),
    ...(input.descriptionSo !== undefined ? { descriptionSo: input.descriptionSo || null } : {}),
    ...(input.brand !== undefined ? { brand: input.brand || null } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(input.marketAssociation !== undefined ? { marketAssociation: input.marketAssociation || null } : {}),
    ...(input.country !== undefined ? { country: input.country || null } : {}),
    ...(input.region !== undefined ? { region: input.region || null } : {}),
    ...(input.city !== undefined ? { city: input.city || null } : {}),
    ...(input.marketName !== undefined ? { marketName: input.marketName || null } : {}),
  };
  if (variants) {
    data.variants = { deleteMany: {}, create: variants.map((variant) => ({ ...variant, price: variant.price, compareAtPrice: variant.compareAtPrice || null })) };
  }
  return prisma.product.update({ where: { id: productId }, data, include: catalogInclude });
}

export async function changeProductStatus(user: AuthenticatedUser, productId: string, status: Extract<ProductStatus, "PUBLISHED" | "ARCHIVED">) {
  await assertApprovedVendor(user.id, user.accountType);
  const product = await prisma.product.findFirst({ where: { id: productId, vendorId: user.id }, select: { id: true, status: true } });
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  if (status === "PUBLISHED") {
    const variants = await prisma.productVariant.count({ where: { productId, isActive: true, stockQuantity: { gte: 0 } } });
    if (variants === 0) throw new AppError("PRODUCT_REQUIRES_VARIANT", 400, "A product must have an active variant before publishing.");
    const images = await prisma.productImage.count({ where: { productId } });
    if (images === 0) throw new AppError("PRODUCT_REQUIRES_IMAGE", 400, "Add at least one product image before publishing.");
  }
  return prisma.product.update({ where: { id: productId }, data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined, archivedAt: status === "ARCHIVED" ? new Date() : null }, include: catalogInclude });
}

export async function addProductImage(user: AuthenticatedUser, productId: string, file: File) {
  await assertApprovedVendor(user.id, user.accountType);
  const product = await prisma.product.findFirst({ where: { id: productId, vendorId: user.id }, select: { id: true } });
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const imageCount = await prisma.productImage.count({ where: { productId } });
  if (imageCount >= 6) throw new AppError("PRODUCT_IMAGE_LIMIT", 400, "A product can have at most six images.");
  const stored = await saveProductImage(file);
  try {
    const count = await prisma.productImage.count({ where: { productId } });
    return await prisma.productImage.create({ data: { productId, vendorId: user.id, ...stored, sortOrder: count, isPrimary: count === 0 } });
  } catch (error) {
    throw error;
  }
}

export async function deleteProductImage(user: AuthenticatedUser, productId: string, imageId: string) {
  await assertApprovedVendor(user.id, user.accountType);
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId, vendorId: user.id } });
  if (!image) throw new AppError("IMAGE_NOT_FOUND", 404, "Product image not found.");
  await prisma.productImage.delete({ where: { id: image.id } });
  return { deleted: true as const };
}

export async function listPublicProducts(query: ProductQuery) {
  const filters: Prisma.ProductWhereInput[] = [];
  if (query.category) {
    filters.push({
      OR: [
        { category: { slug: query.category } },
        { category: { parent: { slug: query.category } } },
      ],
    });
  }
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { nameSo: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { descriptionSo: { contains: query.search, mode: "insensitive" } },
        { brand: { contains: query.search, mode: "insensitive" } },
        { category: { name: { contains: query.search, mode: "insensitive" } } },
        { category: { nameSo: { contains: query.search, mode: "insensitive" } } },
        { category: { parent: { name: { contains: query.search, mode: "insensitive" } } } },
        { category: { parent: { nameSo: { contains: query.search, mode: "insensitive" } } } },
        { vendor: { is: { displayName: { contains: query.search, mode: "insensitive" } } } },
        { vendor: { is: { vendorProfile: { is: { storeName: { contains: query.search, mode: "insensitive" } } } } } },
      ],
    });
  }
  const products = await prisma.product.findMany({
    where: {
      status: "PUBLISHED",
      vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
      ...(filters.length ? { AND: filters } : {}),
      ...(query.country ? { country: query.country } : {}),
      ...(query.region ? { region: query.region } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.brand ? { brand: { contains: query.brand, mode: "insensitive" } } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.inStock || query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            variants: {
              some: {
                isActive: true,
                ...(query.minPrice !== undefined || query.maxPrice !== undefined
                  ? {
                      price: {
                        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
                        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
                      },
                    }
                  : {}),
              },
            },
          }
        : {}),
    },
    include: productInclude,
    orderBy: query.sort === "name" ? { name: "asc" } : { publishedAt: "desc" },
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });
  const availability = await availableStockForVariants(
    products.flatMap((product) =>
      product.variants.map((variant) => ({ id: variant.id, stockQuantity: variant.stockQuantity })),
    ),
  );
  const availableProducts = products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      stockQuantity: availability.get(variant.id) ?? 0,
    })),
  }));
  const inStockProducts = query.inStock
    ? availableProducts.filter((product) => product.variants.some((variant) => variant.isActive && variant.stockQuantity > 0))
    : availableProducts;
  const metrics = await getProductMetrics(inStockProducts.map(({ id }) => id));
  const enriched = inStockProducts.map((product) => ({
    ...product,
    ...(metrics.get(product.id) ?? {
      ratingAverage: 0,
      reviewCount: 0,
      purchaseCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }),
  }));
  const filtered = query.minRating
    ? enriched.filter((product) => product.ratingAverage >= query.minRating!)
    : enriched;
  if (query.sort === "price_asc" || query.sort === "price_desc") {
    const lowest = (product: (typeof enriched)[number]) => {
      const prices = product.variants.filter((variant) => variant.isActive).map((variant) => Number(variant.price));
      return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
    };
    return [...filtered].sort((left, right) => query.sort === "price_asc" ? lowest(left) - lowest(right) : lowest(right) - lowest(left));
  }
  if (query.sort === "best_rated") return [...filtered].sort((left, right) => right.ratingAverage - left.ratingAverage);
  if (query.sort === "best_selling") return [...filtered].sort((left, right) => right.purchaseCount - left.purchaseCount);
  return filtered;
}

export async function getPublicProduct(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, status: "PUBLISHED", vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } } }, include: productInclude });
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const [metrics, vendorRating, related] = await Promise.all([
    getProductMetrics([product.id]),
    prisma.productReview.aggregate({
      where: {
        hiddenAt: null,
        product: {
          vendorId: product.vendorId,
          status: "PUBLISHED",
          vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
        },
      },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: {
        id: { not: product.id },
        status: "PUBLISHED",
        vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
        OR: [
          { categoryId: product.categoryId },
          { vendorId: product.vendorId },
        ],
      },
      select: {
        id: true,
        name: true,
        nameSo: true,
        variants: {
          where: { isActive: true },
          orderBy: { price: "asc" },
          select: { id: true, price: true, compareAtPrice: true, stockQuantity: true },
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: { id: true },
          take: 1,
        },
      },
      take: 6,
    }),
  ]);

  const availability = await availableStockForVariants([
    ...product.variants.map((variant) => ({ id: variant.id, stockQuantity: variant.stockQuantity })),
    ...related.flatMap((item) =>
      item.variants.map((variant) => ({ id: variant.id, stockQuantity: variant.stockQuantity })),
    ),
  ]);
  const availableVariants = product.variants.map((variant) => ({
    ...variant,
    stockQuantity: availability.get(variant.id) ?? 0,
  }));

  return {
    ...product,
    variants: availableVariants,
    ...(metrics.get(product.id) ?? {
      ratingAverage: 0,
      reviewCount: 0,
      purchaseCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }),
    vendorRatingAverage: vendorRating._avg.rating ?? 0,
    vendorReviewCount: vendorRating._count._all,
    relatedProducts: related.map((item) => {
      const selected = item.variants.find((variant) => (availability.get(variant.id) ?? 0) > 0) ?? item.variants[0];
      return {
        id: item.id,
        name: item.name,
        nameSo: item.nameSo,
        price: selected?.price ? Number(selected.price).toFixed(2) : "0.00",
        compareAtPrice: selected?.compareAtPrice ? Number(selected.compareAtPrice).toFixed(2) : null,
        stockQuantity: selected ? availability.get(selected.id) ?? 0 : 0,
        imageId: item.images[0]?.id ?? null,
      };
    }),
    reviews: product.reviews.map((review) => ({ ...review, verifiedPurchase: true })),
  };
}

export async function getProductImage(imageId: string) {
  const image = await prisma.productImage.findFirst({
    where: {
      id: imageId,
      product: {
        status: "PUBLISHED",
        vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
      },
    },
    select: { storageKey: true, mimeType: true },
  });
  if (!image) throw new AppError("IMAGE_NOT_FOUND", 404, "Product image not found.");
  return image;
}

export async function getPublicVendorStoreLogo(vendorId: string) {
  const file = await prisma.vendorApplicationFile.findFirst({
    where: {
      fileType: "STORE_LOGO",
      vendorProfile: {
        is: {
          userId: vendorId,
          applicationStatus: "APPROVED",
          user: { isActive: true },
        },
      },
    },
    select: { storageKey: true, mimeType: true },
  });
  if (!file) throw new AppError("VENDOR_LOGO_NOT_FOUND", 404, "Store logo not found.");
  return file;
}

export async function getVendorProduct(user: AuthenticatedUser, productId: string) {
  await assertApprovedVendor(user.id, user.accountType);
  const product = await prisma.product.findFirst({ where: { id: productId, vendorId: user.id }, include: catalogInclude });
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  return product;
}
