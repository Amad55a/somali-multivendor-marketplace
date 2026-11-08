export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerAwareSiteHeader } from "@/components/layout/customer-aware-site-header";
import { CartPage } from "@/features/commerce/components/cart-page";

export default async function ShoppingCartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="site-chrome">
      <CustomerAwareSiteHeader />
      <CartPage locale={locale} />
      <SiteFooter />
    </div>
  );
}
