export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getVendorDashboardData } from "@/features/vendors/dashboard-service";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorAnalyticsCharts } from "@/features/vendors/components/vendor-analytics-charts";
import { VendorSalesAnalytics } from "@/features/vendors/components/vendor-sales-analytics";
import { getDictionary, createTranslator } from "@/i18n/get-dictionary";

export default async function VendorAnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const { products, counts, variants } = await getVendorDashboardData(user.id);
  const t = createTranslator(await getDictionary(locale));
  const activeVariants = variants.filter((variant) => variant.stockQuantity > 0).length;
  const chartProducts = products.map((product) => ({
    name: product.name,
    stock: product.variants.reduce((total, variant) => total + variant.stockQuantity, 0),
    variants: product.variants.length,
    status: product.status,
  }));
  return (
    <section>
      <h2 className="text-3xl font-bold">{t("vendor.analyticsTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("vendor.analyticsDescription")}</p>
      <VendorSalesAnalytics />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5"><p className="text-sm text-slate-600">{t("vendor.catalogProducts")}</p><p className="mt-2 text-3xl font-bold">{counts.total}</p></div>
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5"><p className="text-sm text-slate-600">{t("vendor.variantsInStock")}</p><p className="mt-2 text-3xl font-bold">{activeVariants}</p></div>
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5"><p className="text-sm text-slate-600">{t("vendor.publishedProducts")}</p><p className="mt-2 text-3xl font-bold">{counts.published}</p></div>
      </div>
      <VendorAnalyticsCharts
        products={chartProducts}
        labels={{
          inventoryByProduct: t("vendor.inventoryByProduct"),
          inventoryByProductHelp: t("vendor.inventoryByProductHelp"),
          createProductForAnalytics: t("vendor.createProductForAnalytics"),
          catalogHealth: t("vendor.catalogHealth"),
          catalogHealthHelp: t("vendor.catalogHealthHelp"),
          noCatalogData: t("vendor.noCatalogData"),
          unitsInStock: t("vendor.unitsInStock"),
          published: t("vendor.published"),
          needsStock: t("vendor.needsStock"),
        }}
      />
    </section>
  );
}
