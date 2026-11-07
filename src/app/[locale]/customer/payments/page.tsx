import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CustomerPaymentHistory } from "@/features/commerce/components/customer-payment-history";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { isLocale } from "@/i18n/config";

export const instant = false;

export default async function CustomerPaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  return (
    <div className="site-chrome">
      <SiteHeader authenticated customerName={user.displayName ?? null} customerEmail={user.email} customerHasPhoto={user.hasProfilePhoto} />
      <CustomerPaymentHistory locale={locale} />
      <SiteFooter />
    </div>
  );
}
