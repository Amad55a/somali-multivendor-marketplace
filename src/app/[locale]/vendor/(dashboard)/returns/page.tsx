export const instant = false;

import { notFound } from "next/navigation";
import { VendorReturnsBoard } from "@/features/vendors/components/vendor-returns-board";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";

export default async function VendorReturnsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireApprovedVendorPage(locale);
  return <VendorReturnsBoard />;
}
