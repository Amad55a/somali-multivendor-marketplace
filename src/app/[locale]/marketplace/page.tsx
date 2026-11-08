export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerAwareSiteHeader } from "@/components/layout/customer-aware-site-header";
import { MarketplaceBrowser } from "@/features/products/components/marketplace-browser";

export default async function MarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; category?: string | string[]; vendorId?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const category = typeof query.category === "string" ? query.category : "";
  const vendorId = typeof query.vendorId === "string" ? query.vendorId : "";
  return (
    <div className="site-chrome">
      <CustomerAwareSiteHeader />
      <MarketplaceBrowser locale={locale} initialSearch={search} initialCategory={category} initialVendorId={vendorId} />
      <SiteFooter />
    </div>
  );
}
