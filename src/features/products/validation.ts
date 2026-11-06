import { z } from "zod";

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  variantName: z.string().trim().min(1).max(160),
  attributes: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(120)).refine((value) => Object.keys(value).length <= 10, "A variant can have at most ten attributes.").optional(),
  price: z.coerce.number().positive().max(999999999),
  compareAtPrice: z.coerce.number().positive().max(999999999).optional(),
  stockQuantity: z.coerce.number().int().min(0).max(2147483647),
  isActive: z.boolean().default(true),
}).strict();

const productFieldsSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nameSo: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  descriptionSo: z.string().trim().max(4000).optional(),
  categoryId: z.uuid(),
  brand: z.string().trim().max(120).optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED"]).optional(),
  marketAssociation: z.string().trim().max(200).optional(),
  country: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  marketName: z.string().trim().max(160).optional(),
  basePrice: z.coerce.number().positive().max(999999999).optional(),
  baseStockQuantity: z.coerce.number().int().min(0).max(2147483647).optional(),
  variants: z.array(variantSchema).max(100).default([]),
}).strict();

export const productCreateSchema = productFieldsSchema.refine((value) => value.variants.length > 0 || (value.basePrice !== undefined && value.baseStockQuantity !== undefined), {
  message: "A base price and stock quantity are required when the product has no selectable variants.",
  path: ["basePrice"],
});

export const productUpdateSchema = productFieldsSchema.partial().extend({
  variants: z.array(variantSchema).max(100).optional(),
}).strict();

export const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(140).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  country: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(120).optional(),
  vendorId: z.uuid().optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "name", "best_rated", "best_selling"]).default("newest"),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, "Minimum price cannot exceed maximum price").strict();
