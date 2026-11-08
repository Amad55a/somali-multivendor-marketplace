"use client";

import { useCallback, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const schema = z.object({
  salesByDay: z.array(z.object({ day: z.string(), total: z.string() })),
  orderStatuses: z.array(z.object({ status: z.string(), count: z.number() })),
  commissionEarned: z.string(),
  refundTotals: z.string(),
  payoutTotals: z.string(),
  topVendors: z.array(z.object({ vendorId: z.string(), total: z.string() })),
  simulated: z.boolean(),
});
const colors = ["#123b35", "#f4b942", "#4d8b78", "#d97706", "#7c3aed"];

export function AdminMarketplaceAnalytics() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadAnalytics = useCallback(async () => {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try {
      setData(await requestApi(`/api/v1/admin/marketplace-analytics?${query}`, schema, t("auth.requestFailed")));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [from, to, t]);
  useVisiblePolling(loadAnalytics, 30_000);
  if (!data) return error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p>{t("header.searchLoading")}</p>;
  return (
    <section>
      <h2 className="text-3xl font-bold">Marketplace analytics</h2>
      <p className="mt-2 text-sm text-slate-600">Gross merchandise sales are pre-discount product subtotals for successfully paid orders; delivery, discounts, and refunds are excluded. Status counts and financial totals use the selected order or transaction date range.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border px-3 py-2" />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl border px-3 py-2" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-600">Commission</p><p className="mt-2 text-3xl font-bold">${data.commissionEarned}</p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-600">Refunds</p><p className="mt-2 text-3xl font-bold">${data.refundTotals}</p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-600">Simulated payouts</p><p className="mt-2 text-3xl font-bold">${data.payoutTotals}</p></div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Gross merchandise sales by day</h3>
          {data.salesByDay.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No successful sales in this range.</p> : (
            <ResponsiveContainer width="100%" height="90%"><BarChart data={data.salesByDay.map((item) => ({ ...item, total: Number(item.total) }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#123b35" /></BarChart></ResponsiveContainer>
          )}
        </div>
        <div className="h-80 rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Orders by status</h3>
          {data.orderStatuses.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No sub-orders yet.</p> : (
            <ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={data.orderStatuses} dataKey="count" nameKey="status" innerRadius={50} outerRadius={80}>{data.orderStatuses.map((item, index) => <Cell key={item.status} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
