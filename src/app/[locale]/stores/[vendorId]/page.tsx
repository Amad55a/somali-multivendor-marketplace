export const instant = false;

import { notFound } from "next/navigation";
import { CustomerAwareSiteHeader } from "@/components/layout/customer-aware-site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PublicStorefrontClient } from "@/features/vendors/components/public-storefront-client";
import { getPublicVendorStorefront } from "@/features/vendors/public-storefront-service";
import { isLocale } from "@/i18n/config";

export default async function PublicVendorStorefrontPage({
  params,
}: {
  params: Promise<{ locale: string; vendorId: string }>;
}) {
  const { locale, vendorId } = await params;
  if (
    !isLocale(locale) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vendorId)
  ) {
    notFound();
  }
  const store = await getPublicVendorStorefront(vendorId);
  if (!store) notFound();

  return (
    <div className="site-chrome">
      <CustomerAwareSiteHeader />
      <PublicStorefrontClient store={store} locale={locale} />
      <SiteFooter />
    </div>
  );
}
