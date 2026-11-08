export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getVendorDashboardData } from "@/features/vendors/dashboard-service";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorCategoryList } from "@/features/vendors/components/vendor-category-list";

export default async function VendorCategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const { categories } = await getVendorDashboardData(user.id);
  return <VendorCategoryList categories={categories} locale={locale} />;
}
