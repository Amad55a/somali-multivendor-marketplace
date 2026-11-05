"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function SiteFooter() {
  const { locale } = useLocaleContext();
  const { t } = useTranslation();

  const marketplaceLinks = [
    { href: "#market-network", label: t("header.nav.markets") },
    { href: "#categories", label: t("header.nav.categories") },
    { href: "#merchant-stores", label: t("header.nav.stores") },
    { href: "#direct-suuq", label: t("header.nav.directSuuq") },
  ];
  const supportLinks = [
    { href: "#why-shop", label: t("footer.supportLinks.trust") },
    { href: "#why-shop", label: t("footer.supportLinks.payments") },
    { href: "#merchant-stores", label: t("footer.supportLinks.stores") },
  ];

  return (
    <footer className="site-chrome border-t border-[#e7ece9] bg-[#f8faf9]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:px-10 lg:py-12">
        <div className="md:col-span-2 lg:col-span-1">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#123b35]"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#123b35] text-[#f4b942]">
              <Store aria-hidden="true" className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-[#123b35]">
              {t("header.brand")}
            </span>
          </Link>
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
            {marketplaceLinks.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-xs text-slate-600 transition-colors hover:text-[#8b5e08] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("footer.supportHeading")}>
          <h2 className="text-sm font-bold text-[#123b35]">
            {t("footer.supportHeading")}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {supportLinks.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <a
                  href={item.href}
                  className="text-xs text-slate-600 transition-colors hover:text-[#8b5e08] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
                >
                  {item.label}
                </a>
              </li>
            ))}
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
