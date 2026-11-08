export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorOrdersBoard } from "@/features/vendors/components/vendor-orders-board";

export default async function VendorOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireApprovedVendorPage(locale);
  return <VendorOrdersBoard />;
}
