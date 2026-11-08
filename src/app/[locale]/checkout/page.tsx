export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CheckoutPage } from "@/features/commerce/components/checkout-page";
import { requirePageAccount } from "@/lib/auth/route-guards";

export default async function CheckoutRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  return (
    <div className="site-chrome">
      <SiteHeader
        authenticated
        customerName={user.displayName ?? null}
        customerEmail={user.email}
        customerHasPhoto={user.hasProfilePhoto}
      />
      <CheckoutPage locale={locale} customerName={user.displayName ?? null} customerEmail={user.email} />
      <SiteFooter />
    </div>
  );
}
