export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { CustomerMarketplaceHome } from "@/features/customer/components/customer-marketplace-home";

export default async function CustomerDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  const dictionary = await getDictionary(locale);
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim() : "";
  return (
    <div className="site-chrome">
      <SiteHeader
        authenticated
        customerName={user.displayName ?? null}
        customerEmail={user.email}
        customerHasPhoto={user.hasProfilePhoto}
      />
      <CustomerMarketplaceHome locale={locale} dictionary={dictionary} search={search} />
      <SiteFooter />
    </div>
  );
}
