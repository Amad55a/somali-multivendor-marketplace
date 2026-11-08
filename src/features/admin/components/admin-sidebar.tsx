"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Headset,
  LayoutDashboard,
  LineChart,
  Bell,
  MessageSquareText,
  FolderTree,
  Package,
  Settings,
  ShoppingCart,
  Store,
  RotateCcw,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/i18n/hooks/use-translation";
import type { Locale } from "@/i18n/config";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";

type AdminSection =
  | "overview"
  | "applications"
  | "users"
  | "vendors"
  | "products"
  | "categories"
  | "coupons"
  | "commissionSettings"
  | "payoutManagement"
  | "reconciliation"
  | "orders"
  | "reviews"
  | "returns"
  | "analytics"
  | "notifications"
  | "communicationReports"
  | "support"
  | "smsOutbox"
  | "auditLogs"
  | "settings";

const icons = {
  overview: LayoutDashboard,
  applications: ClipboardCheck,
  users: Users,
  vendors: Store,
  products: Package,
  categories: FolderTree,
  coupons: ShoppingCart,
  commissionSettings: LineChart,
  payoutManagement: LineChart,
  reconciliation: FileText,
  orders: ShoppingCart,
  reviews: FileText,
  returns: RotateCcw,
  analytics: LineChart,
  notifications: Bell,
  communicationReports: MessageSquareText,
  support: Headset,
  smsOutbox: MessageSquareText,
  auditLogs: FileText,
  settings: Settings,
} satisfies Record<AdminSection, LucideIcon>;

export function AdminSidebar({
  locale,
  open,
  collapsed,
  onClose,
  onToggle,
}: Readonly<{
  locale: Locale;
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}>) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const sections: Array<{
    key: AdminSection;
    href: string;
    label: string;
    activePath: string;
  }> = [
    {
      key: "overview",
      href: `/${locale}/admin/overview`,
      label: t("admin.navigation.overview"),
      activePath: `/${locale}/admin/overview`,
    },
    {
      key: "applications",
      href: `/${locale}/admin/vendors/applications`,
      label: t("admin.navigation.applications"),
      activePath: `/${locale}/admin/vendors/applications`,
    },
    {
      key: "users",
      href: `/${locale}/admin/users`,
      label: t("admin.navigation.users"),
      activePath: `/${locale}/admin/users`,
    },
    {
      key: "vendors",
      href: `/${locale}/admin/vendors`,
      label: t("admin.navigation.vendors"),
      activePath: `/${locale}/admin/vendors`,
    },
    {
      key: "products",
      href: `/${locale}/admin/products`,
      label: t("admin.navigation.products"),
      activePath: `/${locale}/admin/products`,
    },
    {
      key: "categories",
      href: `/${locale}/admin/categories`,
      label: t("admin.navigation.categories"),
      activePath: `/${locale}/admin/categories`,
    },
    {
      key: "coupons",
      href: `/${locale}/admin/coupons`,
      label: t("admin.navigation.coupons"),
      activePath: `/${locale}/admin/coupons`,
    },
    {
      key: "commissionSettings",
      href: `/${locale}/admin/commission-settings`,
      label: t("admin.navigation.commissionSettings"),
      activePath: `/${locale}/admin/commission-settings`,
    },
    {
      key: "payoutManagement",
      href: `/${locale}/admin/payouts`,
      label: t("admin.navigation.payoutManagement"),
      activePath: `/${locale}/admin/payouts`,
    },
    {
      key: "reconciliation",
      href: `/${locale}/admin/financial-reconciliation`,
      label: t("admin.navigation.reconciliation"),
      activePath: `/${locale}/admin/financial-reconciliation`,
    },
    {
      key: "orders",
      href: `/${locale}/admin/orders`,
      label: t("admin.navigation.orders"),
      activePath: `/${locale}/admin/orders`,
    },
    {
      key: "reviews",
      href: `/${locale}/admin/reviews`,
      label: t("admin.navigation.reviews"),
      activePath: `/${locale}/admin/reviews`,
    },
    {
      key: "returns",
      href: `/${locale}/admin/returns`,
      label: t("admin.navigation.returns"),
      activePath: `/${locale}/admin/returns`,
    },
    {
      key: "analytics",
      href: `/${locale}/admin/analytics`,
      label: t("admin.navigation.analytics"),
      activePath: `/${locale}/admin/analytics`,
    },
    {
      key: "notifications",
      href: `/${locale}/admin/notifications`,
      label: t("admin.navigation.notifications"),
      activePath: `/${locale}/admin/notifications`,
    },
    {
      key: "support",
      href: `/${locale}/admin/support`,
      label: t("support.navLabel"),
      activePath: `/${locale}/admin/support`,
    },
    {
      key: "communicationReports",
      href: `/${locale}/admin/communication-reports`,
      label: t("admin.navigation.communicationReports"),
      activePath: `/${locale}/admin/communication-reports`,
    },
    {
      key: "smsOutbox",
      href: `/${locale}/admin/sms-outbox`,
      label: t("admin.navigation.smsOutbox"),
      activePath: `/${locale}/admin/sms-outbox`,
    },
    {
      key: "auditLogs",
      href: `/${locale}/admin/audit-logs`,
      label: t("admin.navigation.auditLogs"),
      activePath: `/${locale}/admin/audit-logs`,
    },
    {
      key: "settings",
      href: `/${locale}/admin/settings`,
      label: t("admin.navigation.settings"),
      activePath: `/${locale}/admin/settings`,
    },
  ];

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label={t("admin.appBar.closeMenu")}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-[#123b35]/40 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex w-72 flex-col bg-[#123b35] text-white shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-20" : "lg:w-72"}`}
      >
        <div className="flex min-h-20 items-center justify-between border-b border-white/10 px-5">
          <SomsuuqLogo
            locale={locale}
            inverse
            href={`/${locale}/admin/overview`}
            subtitle={t("admin.appBar.panelLabel")}
            collapsed={collapsed}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden"
            aria-label={t("admin.appBar.closeMenu")}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <nav aria-label={t("auth.adminLoginTitle")} className="flex-1 overflow-y-auto p-3">
          <p className={`mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 ${collapsed ? "lg:sr-only" : ""}`}>
            {t("admin.appBar.panelLabel")}
          </p>
          <ul className="grid gap-1">
        {sections.map((section) => {
          const active =
            pathname === section.activePath ||
            pathname.startsWith(`${section.activePath}/`);
          const Icon = icons[section.key];
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                title={collapsed ? section.label : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[#f4b942] text-[#123b35]"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span className={collapsed ? "lg:sr-only" : ""}>{section.label}</span>
              </Link>
            </li>
          );
        })}
          </ul>
        </nav>
        <button
          type="button"
          onClick={onToggle}
          className="m-3 hidden min-h-10 items-center justify-center rounded-xl border border-white/15 text-white/70 hover:bg-white/10 lg:flex"
          aria-label={t("admin.appBar.toggleSidebar")}
        >
          <BarChart3 aria-hidden="true" className="size-4" />
          <span className={collapsed ? "sr-only" : "ms-2 text-xs"}>
            {t("admin.appBar.toggleSidebar")}
          </span>
        </button>
      </aside>
    </>
  );
}
