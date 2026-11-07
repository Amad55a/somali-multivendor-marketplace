export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getVendorDashboardData } from "@/features/vendors/dashboard-service";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { StoreProfile } from "@/features/vendors/components/store-profile";

export default async function VendorStorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const { profile } = await getVendorDashboardData(user.id);
  return <StoreProfile profile={profile} />;
}
