"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  Menu,
  ShoppingBag,
  X,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { fetchCart } from "@/features/commerce/cart-api";
import { ProductSearch } from "@/features/products/components/product-search";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import Image from "next/image";
import { z } from "zod";
import { requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

export function SiteHeader({
  authenticated = false,
  customerName = null,
  customerEmail = null,
  customerHasPhoto = false,
}: Readonly<{ authenticated?: boolean; customerName?: string | null; customerEmail?: string | null; customerHasPhoto?: boolean }>) {
  const { locale } = useLocaleContext();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileName, setProfileName] = useState(customerName);
  const [profileHasPhoto, setProfileHasPhoto] = useState(customerHasPhoto);
  const refreshNotifications = useCallback(async () => {
    if (!authenticated) return;
    try {
      const result = await requestApi(
        "/api/v1/customer/notifications",
        z.object({ unreadCount: z.number() }).passthrough(),
        t("auth.requestFailed"),
      );
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error("[customer] Could not load notification count", error);
    }
  }, [authenticated, t]);
  useVisiblePolling(refreshNotifications, 30_000, authenticated);
  useEffect(() => {
    if (!authenticated) return;
    window.addEventListener("customer-notifications-updated", refreshNotifications);
    return () => window.removeEventListener("customer-notifications-updated", refreshNotifications);
  }, [authenticated, refreshNotifications]);

  useEffect(() => {
    if (!authenticated) return;
    const refreshProfile = () => {
      void requestApi(
        "/api/v1/customer/profile",
        z.object({ profile: z.object({ displayName: z.string().nullable(), hasProfilePhoto: z.boolean() }) }).passthrough(),
        t("auth.requestFailed"),
      )
        .then(({ profile }) => {
          setProfileName(profile.displayName);
          setProfileHasPhoto(profile.hasProfilePhoto);
        })
        .catch((error: unknown) => console.error("[customer] Could not refresh profile header", error));
    };
    window.addEventListener("customer-profile-updated", refreshProfile);
    return () => window.removeEventListener("customer-profile-updated", refreshProfile);
  }, [authenticated, t]);

  const navigation = [
    { href: authenticated ? `/${locale}/customer/dashboard` : `/${locale}`, label: t("header.nav.home") },
    { href: `/${locale}/marketplace`, label: t("header.nav.products") },
    { href: `/${locale}/marketplace#categories`, label: t("header.nav.categories") },
    { href: `/${locale}/cart`, label: t("shop.cart") },
  ];

  return (
    <header className="site-chrome sticky top-0 z-50 border-b border-[#e7ece9] bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-8 lg:px-10">
        <div className="flex min-h-16 items-center gap-3 xl:min-h-[4.75rem]">
          <SomsuuqLogo locale={locale} href={authenticated ? `/${locale}/customer/dashboard` : `/${locale}`} />

          <nav
            aria-label={t("header.navLabel")}
            className="hidden shrink-0 items-center gap-3 xl:flex"
          >
            {navigation.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="text-xs font-semibold text-slate-700 transition-colors hover:text-[#a06c0b] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#123b35]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden min-w-40 max-w-2xl flex-1 xl:block">
            <ProductSearch locale={locale} />
          </div>

          <div className="ms-auto hidden shrink-0 items-center gap-2 xl:flex">
            <ThemeToggle />
            <LanguageSwitcher />
            <CartButton locale={locale} cartLabel={t("header.cart")} />
            {authenticated ? (
              <div className="relative flex items-center gap-1">
                <Link href={`/${locale}/customer/notifications`} aria-label={`${t("customerDashboard.notifications")}${unreadCount ? `, ${unreadCount}` : ""}`} className="relative grid size-10 place-items-center rounded-lg text-[#123b35] hover:bg-[#f1f5f3]">
                  <Bell aria-hidden="true" className="size-5" />
                  {unreadCount > 0 && <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-[#d94841] px-1 text-center text-[10px] font-bold leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                </Link>
                <button
                  type="button"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((value) => !value)}
                  className="flex min-h-10 items-center gap-2 rounded-xl border border-[#e1e9e5] px-2.5 text-start hover:bg-[#f5f8f6]"
                >
                  {profileHasPhoto ? (
                    <Image src="/api/v1/customer/profile/photo" alt="" width={32} height={32} unoptimized className="size-8 shrink-0 rounded-full object-cover" />
                  ) : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#123b35] text-xs font-bold text-[#f4b942]">{(profileName || customerEmail || "?").slice(0, 1).toUpperCase()}</span>}
                  <span className="hidden max-w-32 truncate text-xs font-semibold 2xl:block">{profileName || customerEmail || t("auth.accountTitle")}</span>
                  <ChevronDown aria-hidden="true" className="size-4" />
                </button>
                {profileOpen && (
                  <CustomerProfileMenu locale={locale} name={profileName} email={customerEmail} hasPhoto={profileHasPhoto} onNavigate={() => setProfileOpen(false)} />
                )}
              </div>
            ) : (
              <AccountButtons
                signIn={t("header.signIn")}
                signUp={t("header.signUp")}
                locale={locale}
              />
            )}
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-2 xl:hidden">
            {authenticated && <CartButton locale={locale} cartLabel={t("header.cart")} />}
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

        <div className="pb-3 xl:hidden"><ProductSearch locale={locale} /></div>
      </div>

      <nav
        id="mobile-navigation"
        aria-label={t("header.navLabel")}
        className={`${menuOpen ? "block" : "hidden"} border-t border-[#e7ece9] bg-white px-4 py-4 shadow-lg sm:px-8 xl:hidden`}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-1">
          {navigation.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-semibold text-[#123b35] hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-[#123b35]"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#e7ece9] pt-3">
            <ThemeToggle />
            <CartButton locale={locale} cartLabel={t("header.cart")} />
            {authenticated ? (
              <>
                <Link href={`/${locale}/customer/notifications`} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#123b35] hover:bg-[#f1f5f3]">{t("customerDashboard.notifications")} {unreadCount > 0 ? `(${unreadCount})` : ""}</Link>
                <CustomerProfileMenu locale={locale} name={profileName} email={customerEmail} hasPhoto={profileHasPhoto} onNavigate={() => setMenuOpen(false)} compact />
              </>
            ) : (
              <AccountButtons
                signIn={t("header.signIn")}
                signUp={t("header.signUp")}
                locale={locale}
              />
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

function CustomerProfileMenu({
  locale,
  name,
  email,
  hasPhoto,
  onNavigate,
  compact = false,
}: Readonly<{ locale: Parameters<typeof LogoutButton>[0]["locale"]; name: string | null; email: string | null; hasPhoto: boolean; onNavigate: () => void; compact?: boolean }>) {
  const { t } = useTranslation();
  return (
    <div className={`${compact ? "grid gap-1 border-t border-[#e7ece9] pt-3" : "absolute end-0 top-12 z-50 w-64 rounded-2xl border border-[#dce4e1] bg-white p-3 shadow-xl"}`}>
      {!compact && (
        <div className="mb-2 flex items-center gap-3 border-b border-[#e7ece9] pb-3">
          {hasPhoto ? <Image src="/api/v1/customer/profile/photo" alt="" width={40} height={40} unoptimized className="size-10 shrink-0 rounded-full object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#123b35] font-bold text-[#f4b942]">{(name || email || "?").slice(0, 1).toUpperCase()}</span>}
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{name || t("auth.accountTitle")}</span><span className="block truncate text-xs text-slate-500">{email}</span></span>
        </div>
      )}
      <Link onClick={onNavigate} href={`/${locale}/customer/account`} className="rounded-lg px-3 py-2 text-sm font-medium text-[#123b35] hover:bg-[#f1f5f3]">{t("customerDashboard.profile")}</Link>
      <Link onClick={onNavigate} href={`/${locale}/customer/orders`} className="rounded-lg px-3 py-2 text-sm font-medium text-[#123b35] hover:bg-[#f1f5f3]">{t("shop.myOrders")}</Link>
      <div className="px-3 py-2"><LogoutButton locale={locale} /></div>
    </div>
  );
}

function CartButton({
  locale,
  cartLabel,
}: Readonly<{
  locale: string;
  cartLabel: string;
}>) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  const refreshCart = useCallback(async () => {
    try {
      const result = await fetchCart();
      setCount(result.cart.itemCount);
    } catch (error) {
      console.error("[customer] Could not load cart count", error);
    }
  }, []);
  useVisiblePolling(refreshCart, 30_000);
  useEffect(() => {
    window.addEventListener("customer-cart-updated", refreshCart);
    return () => window.removeEventListener("customer-cart-updated", refreshCart);
  }, [refreshCart]);
  return (
    <details className="group relative">
      <summary
        aria-label={cartLabel}
        className="relative grid size-10 cursor-pointer list-none place-items-center rounded-lg text-[#123b35] transition-colors hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35] [&::-webkit-details-marker]:hidden"
      >
        <ShoppingBag aria-hidden="true" className="size-5" />
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#f4b942] px-1 text-[10px] font-bold text-[#123b35]">
            {count}
          </span>
        )}
      </summary>
      <div className="absolute end-0 top-12 z-50 hidden w-40 rounded-xl border border-[#dce4e1] bg-white p-2 shadow-lg group-open:block">
        <Link
          href={`/${locale}/cart`}
          className="block rounded-lg px-3 py-2 text-sm font-semibold text-[#123b35] hover:bg-[#f1f5f3]"
        >
          {t("shop.cart")}
        </Link>
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
