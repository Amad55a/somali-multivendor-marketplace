"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Menu,
  Moon,
  Search,
  ShoppingBag,
  Sun,
  X,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function SiteHeader() {
  const { locale } = useLocaleContext();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);

  function toggleTheme() {
    const nextIsDark = !darkTheme;
    document.documentElement.dataset.theme = nextIsDark ? "dark" : "light";
    setDarkTheme(nextIsDark);
  }

  const navigation = [
    { href: "#market-network", label: t("header.nav.markets") },
    { href: "#categories", label: t("header.nav.categories") },
    { href: "#merchant-stores", label: t("header.nav.stores") },
    { href: "#direct-suuq", label: t("header.nav.directSuuq") },
  ];

  return (
    <header className="site-chrome sticky top-0 z-50 border-b border-[#e7ece9] bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
        <div className="flex min-h-16 items-center justify-between gap-3 xl:min-h-[4.75rem]">
          <SomsuuqLogo locale={locale} />

          <nav
            aria-label={t("header.navLabel")}
            className="hidden shrink-0 items-center gap-5 xl:flex"
          >
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-xs font-semibold text-slate-700 transition-colors hover:text-[#a06c0b] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#123b35]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <form
            action={`/${locale}`}
            className="relative hidden min-w-48 max-w-xs flex-1 xl:flex"
            role="search"
          >
            <label className="sr-only" htmlFor="marketplace-search-desktop">
              {t("header.searchLabel")}
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id="marketplace-search-desktop"
              name="q"
              type="search"
              placeholder={t("header.searchPlaceholder")}
              className="min-h-10 w-full rounded-lg border border-[#dce4e1] bg-[#f8faf9] ps-9 pe-3 text-xs text-[#123b35] outline-none transition focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15"
            />
            <button type="submit" className="sr-only">
              {t("header.searchButton")}
            </button>
          </form>

          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            <LanguageSwitcher />
            <ThemeButton
              darkTheme={darkTheme}
              label={t("header.languageThemeLabel")}
              lightLabel={t("header.lightTheme")}
              darkLabel={t("header.darkTheme")}
              onClick={toggleTheme}
            />
            <CartButton
              cartLabel={t("header.cart")}
              emptyLabel={t("header.cartEmpty")}
              browseLabel={t("header.browseProducts")}
            />
            <AccountButtons
              signIn={t("header.signIn")}
              signUp={t("header.signUp")}
              locale={locale}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 xl:hidden">
            <LanguageSwitcher />
            <button
              type="button"
              aria-label={menuOpen ? t("header.closeMenu") : t("header.openMenu")}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((isOpen) => !isOpen)}
              className="grid size-10 place-items-center rounded-lg border border-[#dce4e1] text-[#123b35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
            >
              {menuOpen ? (
                <X aria-hidden="true" className="size-5" />
              ) : (
                <Menu aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>
        </div>

        <form
          action={`/${locale}`}
          className="relative pb-3 xl:hidden"
          role="search"
        >
          <label className="sr-only" htmlFor="marketplace-search-mobile">
            {t("header.searchLabel")}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="marketplace-search-mobile"
            name="q"
            type="search"
            placeholder={t("header.searchPlaceholder")}
            className="min-h-10 w-full rounded-lg border border-[#dce4e1] bg-[#f8faf9] ps-9 pe-3 text-xs text-[#123b35] outline-none transition focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15"
          />
          <button type="submit" className="sr-only">
            {t("header.searchButton")}
          </button>
        </form>
      </div>

      <nav
        id="mobile-navigation"
        aria-label={t("header.navLabel")}
        className={`${menuOpen ? "block" : "hidden"} border-t border-[#e7ece9] bg-white px-4 py-4 shadow-lg sm:px-8 xl:hidden`}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-1">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-semibold text-[#123b35] hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-[#123b35]"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#e7ece9] pt-3">
            <ThemeButton
              darkTheme={darkTheme}
              label={t("header.languageThemeLabel")}
              lightLabel={t("header.lightTheme")}
              darkLabel={t("header.darkTheme")}
              onClick={toggleTheme}
            />
            <CartButton
              cartLabel={t("header.cart")}
              emptyLabel={t("header.cartEmpty")}
              browseLabel={t("header.browseProducts")}
            />
            <AccountButtons
              signIn={t("header.signIn")}
              signUp={t("header.signUp")}
              locale={locale}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}

function ThemeButton({
  darkTheme,
  label,
  lightLabel,
  darkLabel,
  onClick,
}: Readonly<{
  darkTheme: boolean;
  label: string;
  lightLabel: string;
  darkLabel: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      aria-label={darkTheme ? lightLabel : darkLabel}
      title={label}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-lg text-[#123b35] transition-colors hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
    >
      {darkTheme ? (
        <Sun aria-hidden="true" className="size-5" />
      ) : (
        <Moon aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}

function CartButton({
  cartLabel,
  emptyLabel,
  browseLabel,
}: Readonly<{
  cartLabel: string;
  emptyLabel: string;
  browseLabel: string;
}>) {
  return (
    <details className="group relative">
      <summary
        aria-label={cartLabel}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-lg text-[#123b35] transition-colors hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35] [&::-webkit-details-marker]:hidden"
      >
        <ShoppingBag aria-hidden="true" className="size-5" />
      </summary>
      <div className="site-chrome absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-[#e7ece9] bg-white p-4 text-sm shadow-xl">
        <p className="font-semibold text-[#123b35]">{emptyLabel}</p>
        <a
          href="#featured-products"
          className="mt-3 inline-flex text-xs font-semibold text-[#8b5e08] underline-offset-4 hover:underline"
        >
          {browseLabel}
        </a>
      </div>
    </details>
  );
}

function AccountButtons({
  signIn,
  signUp,
  locale,
}: Readonly<{ signIn: string; signUp: string; locale: string }>) {
  return (
    <>
      <Link
        href={`/${locale}/login`}
        className="min-h-9 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#123b35] hover:bg-[#f1f5f3]"
      >
        {signIn}
      </Link>
      <Link
        href={`/${locale}/register`}
        className="min-h-9 rounded-lg bg-[#123b35] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d5149]"
      >
        {signUp}
      </Link>
    </>
  );
}
