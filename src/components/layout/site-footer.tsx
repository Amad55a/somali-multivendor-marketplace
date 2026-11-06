"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function SiteFooter() {
  const { locale } = useLocaleContext();
  const { t } = useTranslation();

  return (
    <footer className="site-chrome border-t border-[#e7ece9] bg-[#f8faf9]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:px-10 lg:py-12">
        <div className="md:col-span-2 lg:col-span-1">
          <SomsuuqLogo
            locale={locale}
            accessibleLabel={`${t("header.brand")} — ${t("footer.marketplaceHeading")}`}
          />
          <h2 className="mt-4 text-sm font-semibold text-[#123b35]">
            {t("footer.marketplaceHeading")}
          </h2>
          <p className="mt-2 max-w-sm text-xs leading-5 text-slate-600">
            {t("footer.marketplaceDescription")}
          </p>
        </div>

        <nav aria-label={t("footer.marketplaceLinks")}>
          <h2 className="text-sm font-bold text-[#123b35]">
            {t("footer.marketplaceLinks")}
          </h2>
          <ul className="mt-3 space-y-2.5">
            <li><Link href={`/${locale}/marketplace`} className="text-xs text-slate-600 hover:text-[#8b5e08]">{t("header.nav.products")}</Link></li>
            <li><Link href={`/${locale}/marketplace#categories`} className="text-xs text-slate-600 hover:text-[#8b5e08]">{t("header.nav.categories")}</Link></li>
            <li><Link href={`/${locale}/cart`} className="text-xs text-slate-600 hover:text-[#8b5e08]">{t("shop.cart")}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t("footer.supportHeading")}>
          <h2 className="text-sm font-bold text-[#123b35]">
            {t("footer.supportHeading")}
          </h2>
          <ul className="mt-3 space-y-2.5">
            <li><Link href={`/${locale}/customer/orders`} className="text-xs text-slate-600 hover:text-[#8b5e08]">{t("shop.myOrders")}</Link></li>
            <li><Link href={`/${locale}/login`} aria-label={t("auth.accountTitle")} className="text-xs text-slate-600 hover:text-[#8b5e08]">{t("header.signIn")}</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold text-[#123b35]">
            {t("footer.languageHeading")}
          </h2>
          <div className="mt-3 inline-block">
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <div className="border-t border-[#e7ece9]">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-[11px] text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <span>
            © {t("header.brand")}. {t("footer.copyright")}
          </span>
          <span>{t("header.brandDescription")}</span>
        </div>
      </div>
    </footer>
  );
}
