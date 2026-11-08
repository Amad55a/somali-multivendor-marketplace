import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";

export const cartItemSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  quantity: z.number(),
  price: z.string(),
  capturedPrice: z.string().optional(),
  priceChanged: z.boolean().optional(),
  lineTotal: z.string(),
  stockQuantity: z.number(),
  sku: z.string(),
  variantName: z.string(),
  productId: z.string(),
  name: z.string(),
  nameSo: z.string().nullable(),
  imageId: z.string().nullable(),
  storeName: z.string().nullable(),
  vendorId: z.string().optional(),
  deliveryFee: z.string().optional(),
  available: z.boolean(),
});

export const cartSchema = z.object({
  id: z.string().nullable(),
  itemCount: z.number(),
  subtotal: z.string(),
  deliveryTotal: z.string().optional(),
  discountTotal: z.string().optional(),
  total: z.string().optional(),
  hasUnavailable: z.boolean().optional(),
  hasPriceChange: z.boolean().optional(),
  groups: z.array(z.object({
    vendorId: z.string(),
    storeName: z.string().nullable(),
    deliveryFee: z.string(),
    subtotal: z.string(),
    total: z.string(),
    items: z.array(cartItemSchema),
  })).optional(),
  items: z.array(cartItemSchema),
});

export async function fetchCart() {
  return requestApi("/api/v1/cart", z.object({ cart: cartSchema }), "Unable to load cart.");
}

export async function addCartItem(variantId: string, quantity = 1) {
  const result = await requestApi("/api/v1/cart/items", z.object({ cart: cartSchema }), "Unable to add to cart.", postJson({ variantId, quantity }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("customer-cart-updated"));
  return result;
}

export async function setCartQuantity(itemId: string, quantity: number) {
  const result = await requestApi(`/api/v1/cart/items/${itemId}`, z.object({ cart: cartSchema }), "Unable to update cart.", postJson({ quantity }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("customer-cart-updated"));
  return result;
}
