export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { getVendorDashboardData } from "@/features/vendors/dashboard-service";
import { getDictionary, createTranslator } from "@/i18n/get-dictionary";

export default async function VendorDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const data = await getVendorDashboardData(user.id);
  const t = createTranslator(await getDictionary(locale));
  const cards = [
    ["Total sales", `$${data.salesTotal}`],
    ["Total orders", data.orderCounts.total],
    ["Pending orders", data.orderCounts.pending],
    ["Completed orders", data.orderCounts.completed],
    [t("vendor.totalProducts"), data.counts.total],
    [t("vendor.published"), data.counts.published],
    [t("vendor.lowStock"), data.lowStock.length],
    [t("vendor.outOfStock"), data.outOfStock.length],
  ] as const;
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">{t("vendor.panelLabel")}</p>
          <h2 className="mt-1 text-3xl font-bold">{t("vendor.overviewTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("vendor.overviewDescription")}</p>
        </div>
        <span className="rounded-full bg-[#e6f4ed] px-3 py-1 text-xs font-semibold text-[#176044]">{data.profile?.applicationStatus ?? "APPROVED"}</span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-[#123b35]">{value}</p></div>)}
      </div>
      <div className="mt-8 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{t("vendor.recentActivity")}</h3><a href={`/${locale}/vendor/products`} className="text-sm font-semibold text-[#8b5e08] hover:underline">{t("vendor.manageProducts")}</a></div>
        <div className="mt-4 divide-y divide-[#edf1ef]">
          {data.products.length === 0 && <p className="py-6 text-sm text-slate-600">{t("vendor.noProductsYet")}</p>}
          {data.products.map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{product.name}</p><p className="text-xs text-slate-500">{product.category.name} · {t("vendor.updated")} {product.updatedAt.toLocaleDateString(locale)}</p></div><span className="rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-semibold">{product.status}</span></div>)}
        </div>
      </div>
    </section>
  );
}
