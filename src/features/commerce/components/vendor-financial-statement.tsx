"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";

const currencyTotalsSchema = z.array(z.object({ currency: z.string(), amount: z.string() }));

const statementSchema = z.object({
  vendorName: z.string(),
  summary: z.object({
    totalSales: currencyTotalsSchema,
    netEarnings: currencyTotalsSchema,
    totalCommission: currencyTotalsSchema,
    vendorCouponDiscounts: currencyTotalsSchema,
    totalRefunds: currencyTotalsSchema,
    totalAdjustments: currencyTotalsSchema,
    pendingEarnings: currencyTotalsSchema,
    availablePayoutBalance: currencyTotalsSchema,
    payoutProcessing: currencyTotalsSchema,
    totalAlreadyPaid: currencyTotalsSchema,
    negativeBalance: currencyTotalsSchema,
  }),
  pendingOrders: z.array(z.object({
    orderNumber: z.string().nullable(),
    currency: z.string(),
    vendorOrderId: z.string().nullable(),
    grossSales: z.string(),
    commission: z.string(),
    vendorNetEarnings: z.string(),
    products: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      grossSales: z.string(),
      commissionRate: z.string().nullable(),
      commission: z.string().nullable(),
    })),
    deliveryStatus: z.string(),
    deliveredAt: z.string().nullable(),
    eligibilityDate: z.string().nullable(),
    pendingReason: z.string(),
    blockingReturnStatuses: z.array(z.string()),
  })),
  entries: z.array(z.object({
    id: z.string(),
    createdAt: z.string(),
    orderNumber: z.string().nullable(),
    vendorOrderId: z.string().nullable(),
    transactionType: z.string(),
    amount: z.string(),
    currency: z.string(),
    commissionPercent: z.string().nullable(),
    commissionDetails: z.array(z.object({
      product: z.string(),
      rate: z.string().nullable(),
      amount: z.string().nullable(),
    })),
    description: z.string(),
    couponCode: z.string().nullable(),
    payoutReference: z.string().nullable(),
    payoutStatus: z.string(),
  })),
  payouts: z.array(z.object({
    id: z.string(),
    reference: z.string().nullable(),
    batchReference: z.string().nullable(),
    date: z.string(),
    amount: z.string(),
    currency: z.string(),
    status: z.string(),
    simulated: z.boolean(),
    orderCount: z.number(),
    coveredOrders: z.array(z.string()),
  })),
  nextCursor: z.string().nullable(),
});

type Statement = z.infer<typeof statementSchema>;
type Filters = { from: string; to: string; type: string; orderNumber: string; payoutStatus: string };
type Translate = ReturnType<typeof useTranslation>["t"];

const emptyFilters: Filters = { from: "", to: "", type: "", orderNumber: "", payoutStatus: "" };

function pendingReasonLabel(reason: string, t: Translate) {
  switch (reason) {
    case "PAYMENT_NOT_SETTLED": return t("finance.pendingReason.PAYMENT_NOT_SETTLED");
    case "BLOCKING_RETURN": return t("finance.pendingReason.BLOCKING_RETURN");
    case "AWAITING_DELIVERY": return t("finance.pendingReason.AWAITING_DELIVERY");
    case "SEVEN_DAY_HOLD": return t("finance.pendingReason.SEVEN_DAY_HOLD");
    default: return t("finance.pendingReason.ORDER_RECONCILIATION_REQUIRED");
  }
}

function amount(value: string, currency = "USD") {
  const numeric = Number(value);
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatTotals(totals: Array<{ currency: string; amount: string }>) {
  return totals.length === 0 ? "—" : totals.map((total) => amount(total.amount, total.currency)).join(" · ");
}

function buildUrl(filters: Filters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  if (filters.type) params.set("type", filters.type);
  if (filters.orderNumber.trim()) params.set("orderNumber", filters.orderNumber.trim());
  if (filters.payoutStatus) params.set("payoutStatus", filters.payoutStatus);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "50");
  return `/api/v1/vendor/payouts?${params}`;
}

export function VendorFinancialStatement() {
  const { t } = useTranslation();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestApi(buildUrl(emptyFilters), statementSchema, t("finance.requestFailed"))
      .then((result) => {
        if (active) setStatement(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function loadPage(nextCursor?: string | null, nextFilters = appliedFilters) {
    setLoading(true);
    setError(null);
    try {
      const result = await requestApi(buildUrl(nextFilters, nextCursor), statementSchema, t("finance.requestFailed"));
      setStatement((current) => nextCursor && current
        ? { ...result, entries: [...current.entries, ...result.entries] }
        : result);
      setAppliedFilters(nextFilters);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPage(null, filters);
  }

  const cards = statement ? [
    [t("finance.totalSales"), formatTotals(statement.summary.totalSales)],
    [t("finance.netEarnings"), formatTotals(statement.summary.netEarnings)],
    [t("finance.totalCommission"), formatTotals(statement.summary.totalCommission)],
    [t("finance.vendorDiscounts"), formatTotals(statement.summary.vendorCouponDiscounts)],
    [t("finance.totalRefunds"), formatTotals(statement.summary.totalRefunds)],
    [t("finance.totalAdjustments"), formatTotals(statement.summary.totalAdjustments)],
    [t("finance.pendingEarnings"), formatTotals(statement.summary.pendingEarnings)],
    [t("finance.availableBalance"), formatTotals(statement.summary.availablePayoutBalance)],
    [t("finance.payoutProcessing"), formatTotals(statement.summary.payoutProcessing)],
    [t("finance.alreadyPaid"), formatTotals(statement.summary.totalAlreadyPaid)],
    [t("finance.negativeBalance"), formatTotals(statement.summary.negativeBalance)],
  ] : [];

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-[#123b35]">{t("finance.payoutTitle")}</h2>
        {statement && <p className="mt-1 text-sm font-medium text-slate-600">{statement.vendorName}</p>}
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t("finance.payoutDescription")}</p>
        <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t("finance.simulatedNotice")}</p>
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{t("finance.deliveryHoldExplanation")}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#123b35]">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-[#123b35]">{t("finance.pendingEarnings")}</h3>
        {statement?.pendingOrders.length ? (
          <div className="mt-4 space-y-4">
            {statement.pendingOrders.map((order) => (
              <article key={order.vendorOrderId ?? `${order.orderNumber}-${order.currency}`} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-[#123b35]">{order.orderNumber ?? t("finance.orderNeedsReview")}</h4>
                    <p className="mt-1 text-sm text-slate-600">{statement.vendorName} · {order.products.map((product) => `${product.name} × ${product.quantity}`).join(", ") || t("finance.orderNeedsReview")}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{pendingReasonLabel(order.pendingReason, t)}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-slate-500">{t("finance.totalSales")}</dt><dd className="font-semibold">{amount(order.grossSales, order.currency)}</dd></div>
                  <div><dt className="text-slate-500">{t("finance.totalCommission")}</dt><dd className="font-semibold">{amount(order.commission, order.currency)}</dd></div>
                  <div><dt className="text-slate-500">{t("finance.vendorNet")}</dt><dd className="font-semibold">{amount(order.vendorNetEarnings, order.currency)}</dd></div>
                  <div><dt className="text-slate-500">{t("finance.deliveryStatus")}</dt><dd className="font-semibold">{order.deliveryStatus}</dd></div>
                  <div><dt className="text-slate-500">{t("finance.deliveredAt")}</dt><dd className="font-semibold">{order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : t("finance.awaitingDelivery")}</dd></div>
                  <div><dt className="text-slate-500">{t("finance.nextEligibility")}</dt><dd className="font-semibold">{order.eligibilityDate ? new Date(order.eligibilityDate).toLocaleString() : "—"}</dd></div>
                </dl>
                {order.products.map((product) => (
                  <p key={`${product.name}-${product.quantity}`} className="mt-2 text-xs text-slate-600">
                    {product.name}: {product.commissionRate ? `${product.commissionRate}%` : t("finance.commissionRateUnavailable")}
                    {product.commission ? ` · ${amount(product.commission, order.currency)}` : ""}
                  </p>
                ))}
                {order.blockingReturnStatuses.length > 0 && (
                  <p className="mt-2 text-xs text-amber-900">{t("finance.blockingReturns")}: {order.blockingReturnStatuses.join(", ")}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">{t("finance.noPendingOrders")}</p>
        )}
      </section>

      <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-[#123b35]">{t("finance.statement")}</h3>
        <form onSubmit={applyFilters} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1 text-xs font-semibold">{t("finance.date")}
            <input type="date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} className="min-h-10 rounded-lg border border-[#dce4e1] px-2" />
          </label>
          <label className="grid gap-1 text-xs font-semibold">{t("finance.date")}
            <input type="date" value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} className="min-h-10 rounded-lg border border-[#dce4e1] px-2" />
          </label>
          <label className="grid gap-1 text-xs font-semibold">{t("finance.transactionType")}
            <select value={filters.type} onChange={(event) => setFilters((value) => ({ ...value, type: event.target.value }))} className="min-h-10 rounded-lg border border-[#dce4e1] px-2">
              <option value="">All</option>
              {["SALE", "COMMISSION", "VENDOR_DISCOUNT", "DELIVERY_FEE", "REFUND", "REFUND_ADJUSTMENT", "PAYOUT", "ADJUSTMENT"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">{t("finance.order")}
            <input value={filters.orderNumber} onChange={(event) => setFilters((value) => ({ ...value, orderNumber: event.target.value }))} className="min-h-10 rounded-lg border border-[#dce4e1] px-2" />
          </label>
          <label className="grid gap-1 text-xs font-semibold">{t("finance.payoutStatus")}
            <select value={filters.payoutStatus} onChange={(event) => setFilters((value) => ({ ...value, payoutStatus: event.target.value }))} className="min-h-10 rounded-lg border border-[#dce4e1] px-2">
              <option value="">All</option>
              {["UNPAID", "PENDING", "SIMULATED_PAID", "FAILED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <button disabled={loading} className="min-h-10 rounded-lg bg-[#123b35] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 lg:col-span-5">
            {t("finance.previewBalances")}
          </button>
        </form>

        {loading && !statement ? <p className="mt-5 text-sm text-slate-600">{t("finance.loading")}</p> : null}
        {statement && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-[#edf1ef] text-xs text-slate-600"><tr>
                <th className="pb-3 pe-3">{t("finance.date")}</th>
                <th className="pb-3 pe-3">{t("finance.order")}</th>
                <th className="pb-3 pe-3">{t("finance.transactionType")}</th>
                <th className="pb-3 pe-3">{t("finance.commissionRate")}</th>
                <th className="pb-3 pe-3">{t("finance.amount")}</th>
                <th className="pb-3 pe-3">{t("finance.coupon")}</th>
                <th className="pb-3 pe-3">{t("finance.payoutStatus")}</th>
                <th className="pb-3">{t("finance.description")}</th>
              </tr></thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {statement.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 pe-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="py-3 pe-3">{entry.orderNumber ?? "—"}</td>
                    <td className="py-3 pe-3">{entry.transactionType}</td>
                    <td className="py-3 pe-3">
                      {entry.commissionPercent
                        ? `${entry.commissionPercent}%`
                        : entry.commissionDetails.length
                          ? entry.commissionDetails.map((detail) => `${detail.product}: ${detail.rate ? `${detail.rate}%` : "—"}`).join(", ")
                          : "—"}
                    </td>
                    <td className="py-3 pe-3 font-semibold">{amount(entry.amount, entry.currency)}</td>
                    <td className="py-3 pe-3">{entry.couponCode ?? "—"}</td>
                    <td className="py-3 pe-3">{entry.payoutStatus}</td>
                    <td className="py-3 text-slate-600">{entry.description}</td>
                  </tr>
                ))}
                {statement.entries.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-600">{t("finance.noStatementEntries")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {statement?.nextCursor && (
          <button type="button" disabled={loading} onClick={() => void loadPage(statement.nextCursor)} className="mt-4 rounded-lg border border-[#dce4e1] px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {t("auth.submit")}
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-[#123b35]">{t("finance.processedBatch")}</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-[#edf1ef] text-xs text-slate-600"><tr>
              <th className="pb-3 pe-4">{t("finance.reference")}</th>
              <th className="pb-3 pe-4">{t("finance.batchReference")}</th>
              <th className="pb-3 pe-4">{t("finance.date")}</th>
              <th className="pb-3 pe-4">{t("finance.orderCount")}</th>
              <th className="pb-3 pe-4">{t("finance.amount")}</th>
              <th className="pb-3 pe-4">{t("finance.payoutStatus")}</th>
              <th className="pb-3">{t("finance.coveredOrders")}</th>
            </tr></thead>
            <tbody className="divide-y divide-[#edf1ef]">
              {statement?.payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="py-3 pe-4 font-semibold">{payout.reference ?? payout.id}</td>
                  <td className="py-3 pe-4">{payout.batchReference ?? "—"}</td>
                  <td className="py-3 pe-4">{new Date(payout.date).toLocaleString()}</td>
                  <td className="py-3 pe-4">{payout.orderCount}</td>
                  <td className="py-3 pe-4">{amount(payout.amount, payout.currency)} {payout.currency}</td>
                  <td className="py-3 pe-4">{payout.status}</td>
                  <td className="py-3">{payout.coveredOrders.join(", ") || "—"}</td>
                </tr>
              ))}
              {statement?.payouts.length === 0 && <tr><td colSpan={7} className="py-5 text-center text-slate-600">{t("finance.noPayouts")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
