export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { VendorProductManager } from "@/features/products/components/vendor-product-manager";

export default async function VendorProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  return <VendorProductManager />;
}
