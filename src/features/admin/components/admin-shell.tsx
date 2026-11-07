"use client";

import { Bell, ChevronDown, Menu, Search, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

export function AdminShell({
  children,
  locale,
  email,
}: Readonly<{
  children: ReactNode;
  locale: Locale;
  email: string;
}>) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi(
        "/api/v1/admin/notifications",
        z.object({ unreadCount: z.number() }).passthrough(),
        t("auth.requestFailed"),
      );
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error("[admin] Could not load notification count", error);
    }
  }, [t]);
  useVisiblePolling(loadNotifications, 30_000);
  useEffect(() => {
    window.addEventListener("admin-notifications-updated", loadNotifications);
    return () => window.removeEventListener("admin-notifications-updated", loadNotifications);
  }, [loadNotifications]);
  const pageTitle = pathname.includes("/applications")
    ? t("admin.navigation.applications")
    : pathname.includes("/users")
      ? t("admin.navigation.users")
      : pathname.includes("/audit-logs")
        ? t("admin.navigation.auditLogs")
        : pathname.includes("/vendors")
          ? t("admin.navigation.vendors")
          : pathname.includes("/customers")
            ? t("admin.navigation.customers")
            : pathname.includes("/products")
              ? t("admin.navigation.products")
              : pathname.includes("/categories")
                ? t("admin.navigation.categories")
                    : pathname.includes("/commission-settings")
                      ? t("admin.navigation.commissionSettings")
                      : pathname.includes("/financial-reconciliation")
                        ? t("admin.navigation.reconciliation")
                    : pathname.includes("/coupons")
                      ? "Coupons"
                      : pathname.includes("/payouts")
                        ? t("admin.navigation.payoutManagement")
                      : pathname.includes("/reviews")
                      ? t("admin.navigation.reviews")
                      : pathname.includes("/returns")
                        ? t("admin.navigation.returns")
                    : pathname.includes("/orders")
                    ? t("admin.navigation.orders")
                    : pathname.includes("/analytics")
                      ? t("admin.navigation.analytics")
                      : pathname.includes("/notifications")
                        ? t("admin.navigation.notifications")
                        : pathname.includes("/settings")
                          ? t("admin.navigation.settings")
                          : t("admin.navigation.overview");
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#123b35] lg:flex">
      <AdminSidebar
        locale={locale}
        open={sidebarOpen}
        collapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b border-[#e1e9e5] bg-white/95 px-4 shadow-sm backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-[#d5dfda] p-2 lg:hidden"
              aria-label={t("admin.appBar.openMenu")}
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="hidden text-xs font-medium text-slate-500 sm:block">
                {t("admin.appBar.breadcrumb")}
              </p>
              <h1 className="truncate text-lg font-bold sm:text-xl">{pageTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <label className="relative hidden w-52 md:block">
              <span className="sr-only">{t("admin.appBar.search")}</span>
              <Search aria-hidden="true" className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder={t("admin.appBar.search")}
                className="min-h-10 w-full rounded-xl border border-[#dce4e1] bg-[#f8faf9] ps-9 pe-3 text-sm outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15"
              />
            </label>
            <Link
              href={`/${locale}/admin/notifications`}
              className="relative rounded-xl p-2.5 text-slate-600 hover:bg-[#f1f5f3]"
              aria-label={`${t("admin.appBar.notifications")}${unreadCount ? `, ${unreadCount}` : ""}`}
            >
              <Bell aria-hidden="true" className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-[#d94841] px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-[#f1f5f3]"
              >
                <span className="grid size-9 place-items-center rounded-full bg-[#123b35] text-xs font-bold text-[#f4b942]">{initials}</span>
                <span className="hidden max-w-36 truncate text-start text-sm font-semibold sm:block">{email}</span>
                <ChevronDown aria-hidden="true" className="hidden size-4 sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute end-0 top-12 z-30 w-64 rounded-xl border border-[#dce4e1] bg-white p-3 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-[#e7ece9] pb-3">
                    <UserCircle aria-hidden="true" className="size-8 text-[#123b35]" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{t("admin.appBar.adminAccount")}</p>
                      <p className="truncate text-sm font-semibold">{email}</p>
                    </div>
                  </div>
                  <div className="pt-3">
                    <a
                      href={`/${locale}/admin/settings`}
                      className="mb-2 block rounded-lg px-3 py-2 text-sm font-medium text-[#123b35] hover:bg-[#f1f5f3]"
                    >
                      {t("admin.appBar.account")}
                    </a>
                    <LogoutButton locale={locale} admin />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
