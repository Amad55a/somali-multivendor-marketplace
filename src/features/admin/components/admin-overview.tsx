"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";
import { VendorStatusChart } from "@/features/admin/components/vendor-status-chart";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const overviewSchema = z.object({
  totalUsers: z.number().int(),
  totalCustomers: z.number().int(),
  totalVendors: z.number().int(),
  pendingApplications: z.number().int(),
  approvedVendors: z.number().int(),
  rejectedApplications: z.number().int(),
  statusBreakdown: z.object({
    draft: z.number().int(),
    pending: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
    changesRequested: z.number().int(),
  }),
  recentActivity: z.array(z.object({
    id: z.string(),
    action: z.string(),
    createdAt: z.string(),
    actorEmail: z.string().nullable(),
  })),
});

export function AdminOverview({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<z.infer<typeof overviewSchema> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await requestApi("/api/v1/admin/overview", overviewSchema, t("auth.requestFailed")));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadOverview, 30_000);

  const cards = overview
    ? [
        {
          label: t("admin.overview.totalUsers"),
          value: overview.totalUsers,
          href: `/${locale}/admin/users`,
        },
        {
          label: t("admin.overview.totalCustomers"),
          value: overview.totalCustomers,
          href: `/${locale}/admin/customers`,
        },
        {
          label: t("admin.overview.totalVendors"),
          value: overview.totalVendors,
          href: `/${locale}/admin/vendors`,
        },
        {
          label: t("admin.overview.pendingApplications"),
          value: overview.pendingApplications,
          href: `/${locale}/admin/vendors/applications`,
        },
        {
          label: t("admin.overview.approvedVendors"),
          value: overview.approvedVendors,
          href: `/${locale}/admin/vendors`,
        },
        {
          label: t("admin.overview.rejectedApplications"),
          value: overview.rejectedApplications,
          href: `/${locale}/admin/vendors/applications`,
        },
      ]
    : [];

  return (
    <section>
      <h2 className="text-2xl font-bold text-[#123b35]">
        {t("admin.overview.title")}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {t("admin.overview.description")}
      </p>
      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      {!overview && !error && (
        <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
      {overview && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-xl border border-[#e1e9e5] bg-white p-5 shadow-sm transition hover:border-[#123b35]"
              >
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <p className="mt-3 text-3xl font-bold tabular-nums text-[#123b35]">
                  {card.value.toLocaleString(locale)}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-6 max-w-xl">
            <VendorStatusChart statusBreakdown={overview.statusBreakdown} />
          </div>
          <section className="mt-6 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-[#123b35]">
              {t("admin.overview.recentActivity")}
            </h3>
            {overview.recentActivity.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                {t("admin.overview.noRecentActivity")}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#e7ece9]">
                {overview.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="font-medium text-[#123b35]">{entry.action}</span>
                    <span className="text-xs text-slate-500">
                      {entry.actorEmail ?? "—"} · {new Date(entry.createdAt).toLocaleString(locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
