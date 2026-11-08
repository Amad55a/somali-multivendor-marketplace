export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorCommunications } from "@/features/vendors/components/vendor-communications";

export default async function VendorNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireApprovedVendorPage(locale);
  return <VendorCommunications />;
}
