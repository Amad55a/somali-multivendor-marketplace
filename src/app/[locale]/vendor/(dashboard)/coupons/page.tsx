export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { CouponManager } from "@/features/commerce/components/coupon-manager";

export default async function VendorCouponsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireApprovedVendorPage(locale);

  return <CouponManager mode="vendor" />;
}
