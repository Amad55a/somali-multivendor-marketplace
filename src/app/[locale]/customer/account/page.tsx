export const instant = false;

import { notFound } from "next/navigation";
import { CustomerProfile } from "@/features/customer/components/customer-profile";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  return (
    <div className="site-chrome">
      <SiteHeader authenticated customerName={user.displayName ?? null} customerEmail={user.email} customerHasPhoto={user.hasProfilePhoto} />
      <CustomerProfile locale={locale} />
      <SiteFooter />
    </div>
  );
}
