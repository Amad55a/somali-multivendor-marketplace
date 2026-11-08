"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, Boxes, ChevronDown, FolderTree, LayoutDashboard, Menu, Package, Settings, ShoppingCart, UserCircle, BarChart3, Search, Store, RotateCcw, MessageSquareText, LifeBuoy } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { requestApi } from "@/lib/api/client";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { TranslationKey } from "@/i18n/types";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
import { VendorNotificationBell } from "@/features/vendors/components/vendor-notification-bell";

const pageTitles: Record<string, TranslationKey> = {
  dashboard: "vendor.overviewTitle",
  store: "vendor.storeTitle",
  products: "vendor.productsTitle",
  categories: "vendor.categoriesTitle",
  coupons: "vendor.couponsTitle",
  orders: "vendor.ordersTitle",
  returns: "vendor.returnsTitle",
  inventory: "vendor.inventoryTitle",
  analytics: "vendor.analyticsTitle",
  payouts: "finance.payoutTitle",
  notifications: "vendor.notificationsTitle",
  communications: "vendor.communicationsTitle",
  messages: "communications.title",
  help: "support.navLabel",
  settings: "vendor.settingsTitle",
};

export function VendorShell({ children, locale, email, storeName, logoFileId }: Readonly<{ children: ReactNode; locale: Locale; email: string; storeName: string | null; logoFileId: string | null }>) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const loadUnreadMessages = useCallback(async () => {
    try {
      const result = await requestApi(
        "/api/v1/conversations",
        z.object({ conversations: z.array(z.object({ unreadCount: z.number() })) }),
        t("auth.requestFailed"),
      );
      setUnreadMessages(result.conversations.reduce((total, item) => total + item.unreadCount, 0));
    } catch (error) {
      console.error("[vendor] Could not load unread message count", error);
    }
  }, [t]);
  useVisiblePolling(loadUnreadMessages, 30_000);
  const pageKey = pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";
  const pageTitle = t(pageTitles[pageKey] ?? "vendor.overviewTitle");
  const links = [
    { href: `/${locale}/vendor/dashboard`, label: t("vendor.nav.dashboard"), icon: LayoutDashboard },
    { href: `/${locale}/vendor/store`, label: t("vendor.nav.store"), icon: Store },
    { href: `/${locale}/vendor/products`, label: t("vendor.nav.products"), icon: Package },
    { href: `/${locale}/vendor/categories`, label: t("vendor.nav.categories"), icon: FolderTree },
    { href: `/${locale}/vendor/coupons`, label: t("vendor.couponsTitle"), icon: ShoppingCart },
    { href: `/${locale}/vendor/payouts`, label: t("vendor.nav.payouts"), icon: BarChart3 },
    { href: `/${locale}/vendor/orders`, label: t("vendor.nav.orders"), icon: ShoppingCart },
    { href: `/${locale}/vendor/returns`, label: t("vendor.nav.returns"), icon: RotateCcw },
    { href: `/${locale}/vendor/inventory`, label: t("vendor.nav.inventory"), icon: Boxes },
    { href: `/${locale}/vendor/analytics`, label: t("vendor.nav.analytics"), icon: BarChart3 },
    { href: `/${locale}/vendor/notifications`, label: t("vendor.nav.notifications"), icon: Bell },
    { href: `/${locale}/vendor/help`, label: t("support.navLabel"), icon: LifeBuoy },
    { href: `/${locale}/vendor/settings`, label: t("vendor.nav.settings"), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#123b35] lg:flex">
      {open && <button type="button" aria-label={t("auth.closeMenu")} onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-[#123b35]/40 lg:hidden" />}
      <aside className={`fixed inset-y-0 start-0 z-40 h-dvh w-72 overflow-y-auto bg-[#123b35] p-5 text-white shadow-2xl transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-white/10 pb-6">
          <SomsuuqLogo locale={locale} inverse href={`/${locale}/vendor/dashboard`} subtitle={t("vendor.brandSubtitle")} />
          <div className="mt-5 flex min-w-0 items-center gap-3 rounded-xl bg-white/10 p-3">
            {logoFileId ? (
              <Image
                src={`/api/v1/vendor/application-files/${logoFileId}`}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="size-10 shrink-0 rounded-lg bg-white object-cover"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#f4b942] text-sm font-bold text-[#123b35]">
                {(storeName ?? email).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/55">
                {t("vendor.storeTitle")}
              </span>
              <span className="block truncate text-sm font-bold text-white">
                {storeName ?? t("vendor.storeNameUnset")}
              </span>
            </span>
          </div>
        </div>
        <nav className="mt-6 grid gap-2" aria-label={t("vendor.nav.dashboard")}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${active ? "bg-[#f4b942] text-[#123b35]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}><Icon className="size-5" aria-hidden="true" />{label}{href.endsWith("/notifications") && unreadMessages > 0 ? <span className="ms-auto rounded-full bg-[#f4b942] px-2 py-0.5 text-[10px] font-bold text-[#123b35]">{unreadMessages > 99 ? "99+" : unreadMessages}</span> : null}</Link>;
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-2 border-b border-[#e1e9e5] bg-white/95 px-2 shadow-sm backdrop-blur sm:gap-3 sm:px-8">
          <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-[#d5dfda] p-2 lg:hidden" aria-label={t("auth.openMenu")}><Menu className="size-5" /></button>
          <div className="min-w-0">
            <p className="hidden text-xs font-medium text-slate-500 sm:block">{t("vendor.panelLabel")}</p>
            <h1 className="truncate text-lg font-bold">{pageTitle}</h1>
          </div>
          <label className="relative hidden max-w-xs flex-1 md:block">
            <span className="sr-only">{t("vendor.search")}</span>
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" placeholder={t("vendor.searchPlaceholder")} className="min-h-10 w-full rounded-xl border border-[#dce4e1] bg-[#f8faf9] ps-9 pe-3 text-sm outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" />
          </label>
          <VendorNotificationBell />
          <LanguageSwitcher />
          <div className="relative">
            <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-[#f1f5f3]" aria-expanded={profileOpen}>
              <span className="grid size-9 place-items-center rounded-full bg-[#123b35] text-xs font-bold text-[#f4b942]">{email.slice(0, 2).toUpperCase()}</span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">{email}</span><ChevronDown className="size-4" />
            </button>
            {profileOpen && <div className="absolute end-0 top-12 z-30 w-60 rounded-xl border border-[#dce4e1] bg-white p-3 shadow-xl"><div className="mb-3 flex gap-2 border-b border-[#e7ece9] pb-3"><UserCircle className="size-7" /><span className="truncate text-sm font-semibold">{email}</span></div><LogoutButton locale={locale} /></div>}
          </div>
        </header>
        <main className="p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
