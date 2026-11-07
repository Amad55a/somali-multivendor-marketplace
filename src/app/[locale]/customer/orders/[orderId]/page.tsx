export const instant = false;

import { notFound } from "next/navigation";
import { z } from "zod";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CustomerOrderDetail } from "@/features/commerce/components/customer-order-detail";
import { getCustomerOrder } from "@/features/commerce/service";
import { isLocale } from "@/i18n/config";
import { AppError } from "@/lib/errors/app-error";
import { requirePageAccount } from "@/lib/auth/route-guards";

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  if (!isLocale(locale)) notFound();
  if (!z.uuid().safeParse(orderId).success) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  const result = await getCustomerOrder(user, orderId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "ORDER_NOT_FOUND") notFound();
    throw error;
  });
  return (
    <div className="site-chrome">
      <SiteHeader authenticated customerName={user.displayName ?? null} customerEmail={user.email} customerHasPhoto={user.hasProfilePhoto} />
      <CustomerOrderDetail order={result.order} locale={locale} />
      <SiteFooter />
    </div>
  );
}
