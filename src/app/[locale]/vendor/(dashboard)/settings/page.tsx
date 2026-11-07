export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { getDictionary, createTranslator } from "@/i18n/get-dictionary";

export default async function VendorSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const t = createTranslator(await getDictionary(locale));
  return (
    <section>
      <h2 className="text-3xl font-bold">{t("vendor.settingsTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("vendor.settingsDescription")}</p>
      <div className="mt-6 rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm">
        <h3 className="font-bold">{t("vendor.account")}</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("auth.email")}</dt><dd className="mt-1">{user.email}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("vendor.role")}</dt><dd className="mt-1">{t("auth.vendor")}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-slate-600">{t("vendor.settingsNote")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`/${locale}/vendor/store`} className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white">{t("vendor.nav.store")}</a>
          <a href={`/${locale}/forgot-password`} className="rounded-xl border px-4 py-2 text-sm font-semibold">{t("auth.forgotPassword")}</a>
        </div>
      </div>
    </section>
  );
}
