export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getVendorDashboardData } from "@/features/vendors/dashboard-service";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorInventoryTable } from "@/features/vendors/components/vendor-inventory-table";

export default async function VendorInventoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const { variants } = await getVendorDashboardData(user.id);
  return (
    <VendorInventoryTable
      variants={variants.map((variant) => ({
        ...variant,
        updatedAt: variant.updatedAt.toISOString(),
      }))}
    />
  );
}
