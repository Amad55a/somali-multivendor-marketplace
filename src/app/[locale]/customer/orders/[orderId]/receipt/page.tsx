import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PaymentReceiptView } from "@/features/commerce/components/payment-receipt-view";
import { getCustomerPaymentReceipt } from "@/features/commerce/marketplace-workflow";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";

export const instant = false;

export default async function CustomerPaymentReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  const receipt = await getCustomerPaymentReceipt(user, orderId);
  if (!receipt) notFound();
  return (
    <div className="site-chrome">
      <SiteHeader authenticated customerName={user.displayName ?? null} customerEmail={user.email} customerHasPhoto={user.hasProfilePhoto} />
      <PaymentReceiptView locale={locale} receipt={receipt} />
      <SiteFooter />
    </div>
  );
}
