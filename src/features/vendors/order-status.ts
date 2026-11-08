import type { TranslationKey } from "@/i18n/types";

const vendorOrderStatusKeys: Record<string, TranslationKey> = {
  NEW: "vendor.orderStatusNew",
  CONFIRMED: "vendor.orderStatusConfirmed",
  PROCESSING: "vendor.orderStatusProcessing",
  PACKED: "vendor.orderStatusPacked",
  READY: "vendor.orderStatusReady",
  SHIPPED: "vendor.orderStatusShipped",
  DELIVERED: "vendor.orderStatusDelivered",
  CANCELLED: "vendor.orderStatusCancelled",
  EXPIRED: "vendor.orderStatusExpired",
};

export function vendorOrderStatusTranslationKey(status: string): TranslationKey {
  return vendorOrderStatusKeys[status] ?? "vendor.status";
}
