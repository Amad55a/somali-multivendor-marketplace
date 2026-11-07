export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerAwareSiteHeader } from "@/components/layout/customer-aware-site-header";
import ProductDetailClient from "@/features/products/components/product-detail-client";

export default async function ProductDetailPage({ params }: { params: Promise<{ locale: string; productId: string }> }) {
  const { locale, productId } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="site-chrome">
      <CustomerAwareSiteHeader />
      <ProductDetailClient productId={productId} locale={locale} />
      <SiteFooter />
    </div>
  );
}
