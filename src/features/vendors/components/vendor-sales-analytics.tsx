"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const schema = z.object({
  totalSales: z.string(),
  totalOrders: z.number(),
  averageOrderValue: z.string(),
  financialSummary: z.object({
    totalSales: z.array(z.object({ currency: z.string(), amount: z.string() })),
    totalCommission: z.array(z.object({ currency: z.string(), amount: z.string() })),
    vendorDiscounts: z.array(z.object({ currency: z.string(), amount: z.string() })),
    totalRefunds: z.array(z.object({ currency: z.string(), amount: z.string() })),
    deliveryFees: z.array(z.object({ currency: z.string(), amount: z.string() })),
    netEarnings: z.array(z.object({ currency: z.string(), amount: z.string() })),
    pendingEarnings: z.array(z.object({ currency: z.string(), amount: z.string() })),
    availablePayoutBalance: z.array(z.object({ currency: z.string(), amount: z.string() })),
    alreadyPaid: z.array(z.object({ currency: z.string(), amount: z.string() })),
  }),
  topProducts: z.array(z.object({ name: z.string(), quantity: z.number(), revenue: z.string() })),
  statusCounts: z.array(z.object({ status: z.string(), count: z.number() })),
});

const colors = ["#123b35", "#f4b942", "#4d8b78", "#d97706", "#7c3aed"];

function formatTotals(totals: Array<{ currency: string; amount: string }>) {
  return totals
    .map(({ currency, amount }) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount)))
    .join(" · ") || "—";
}

export function VendorSalesAnalytics() {
  const { t } = useTranslation();
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadAnalytics = useCallback(async () => {
    try {
      setData(await requestApi("/api/v1/vendor/analytics", schema, t("auth.requestFailed")));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadAnalytics, 30_000);
  if (!data) return error ? <p role="alert" className="mt-6 text-sm text-red-700">{error}</p> : <p className="mt-6 text-sm text-slate-500">{t("header.searchLoading")}</p>;
  return (
    <div className="mt-6">
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          [t("finance.totalSales"), data.financialSummary.totalSales],
          [t("finance.totalCommission"), data.financialSummary.totalCommission],
          [t("finance.vendorDiscounts"), data.financialSummary.vendorDiscounts],
          [t("finance.totalRefunds"), data.financialSummary.totalRefunds],
          [t("finance.deliveryFees"), data.financialSummary.deliveryFees],
          [t("finance.netEarnings"), data.financialSummary.netEarnings],
          [t("finance.pendingEarnings"), data.financialSummary.pendingEarnings],
          [t("finance.availableBalance"), data.financialSummary.availablePayoutBalance],
          [t("finance.alreadyPaid"), data.financialSummary.alreadyPaid],
        ] as const).map(([label, totals]) => (
          <div key={label} className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#123b35]">{formatTotals(totals)}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <p className="text-sm text-slate-600">Paid orders</p>
          <p className="mt-2 text-3xl font-bold">{data.totalOrders}</p>
        </div>
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <p className="text-sm text-slate-600">Average product sales per order</p>
          <p className="mt-2 text-3xl font-bold">${data.averageOrderValue}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <h3 className="font-bold">Top selling products</h3>
          {data.topProducts.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{t("vendor.noCatalogData")}</p> : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e1e9e5" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#123b35" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <h3 className="font-bold">Order status</h3>
          {data.statusCounts.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{t("vendor.noOrdersTitle")}</p> : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.statusCounts} dataKey="count" nameKey="status" innerRadius={62} outerRadius={94} paddingAngle={4}>
                    {data.statusCounts.map((item, index) => <Cell key={item.status} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
