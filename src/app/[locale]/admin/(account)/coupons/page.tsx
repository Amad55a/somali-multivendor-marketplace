export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { CouponManager } from "@/features/commerce/components/coupon-manager";

export default async function AdminCouponsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requirePageAccount("ADMIN", locale);

  return <CouponManager mode="admin" />;
}
