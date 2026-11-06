"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";

const reconciliationSchema = z.object({
  checkedVendorOrders: z.number(),
  discrepancyCount: z.number(),
  checkedAt: z.string(),
  vendorOrderReconciliations: z.array(z.object({
    vendorOrderId: z.string(),
    orderNumber: z.string(),
    vendorName: z.string(),
    currency: z.string(),
    appliedRates: z.array(z.object({ category: z.string(), rate: z.string().nullable() })),
    expectedCommission: z.string().nullable(),
    actualCommission: z.string(),
    expectedVendorEarnings: z.string().nullable(),
    actualVendorEarnings: z.string(),
    difference: z.string().nullable(),
    payoutStatus: z.string(),
    issue: z.string(),
  })),
  discrepancies: z.array(z.object({
    vendorOrderId: z.string(),
    orderNumber: z.string(),
    vendorName: z.string(),
    currency: z.string(),
    expectedAmount: z.string(),
    actualAmount: z.string(),
    status: z.string(),
    paymentStatus: z.string(),
    difference: z.string(),
    details: z.record(z.string(), z.string()),
    issue: z.string(),
  })),
  couponDiscrepancies: z.array(z.object({
    orderId: z.string(),
    orderNumber: z.string(),
    couponCodes: z.array(z.string()),
    currency: z.string(),
    expectedAmount: z.string(),
    redeemedAmount: z.string(),
    ledgerAmount: z.string(),
    issue: z.string(),
  })),
  paymentDiscrepancies: z.array(z.object({
    orderId: z.string(),
    orderNumber: z.string(),
    currency: z.string(),
    expectedAmount: z.string(),
    actualAmount: z.string(),
    issue: z.string(),
  })),
  payoutDiscrepancies: z.array(z.object({
    payoutId: z.string(),
    reference: z.string().nullable(),
    vendorId: z.string(),
    status: z.string(),
    currency: z.string(),
    expectedAmount: z.string(),
    reservedAmount: z.string(),
    recordedPayout: z.string(),
    issue: z.string(),
  })),
  payoutBatches: z.array(z.object({
    id: z.string(),
    weekKey: z.string(),
    status: z.string(),
    totalAmounts: z.array(z.object({ currency: z.string(), amount: z.string() })),
    vendorCount: z.number(),
  })),
});

type Reconciliation = z.infer<typeof reconciliationSchema>;

function formatTotals(totals: Array<{ currency: string; amount: string }>) {
  return totals
    .map(({ currency, amount }) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount)))
    .join(" · ") || "—";
}

export function AdminFinancialReconciliation() {
  const { t } = useTranslation();
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestApi("/api/v1/admin/financial-reconciliation", reconciliationSchema, t("finance.requestFailed"))
      .then((result) => {
        if (active) setData(result);
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

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-[#123b35]">{t("finance.reconciliationTitle")}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t("finance.reconciliationDescription")}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-600">{t("finance.loading")}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">{t("finance.checkedVendorOrders")}</p>
              <p className="mt-2 text-3xl font-bold text-[#123b35]">{data.checkedVendorOrders}</p>
            </div>
            <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">{t("finance.discrepancies")}</p>
              <p className={`mt-2 text-3xl font-bold ${data.discrepancyCount ? "text-red-700" : "text-[#176044]"}`}>{data.discrepancyCount}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("finance.changedAt")}: {new Date(data.checkedAt).toLocaleString()}</p>

          <section className="overflow-x-auto rounded-2xl border border-[#e1e9e5] bg-white shadow-sm">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-[#f5f8f6] text-slate-600"><tr>
                <th className="p-4">{t("finance.order")}</th>
                <th className="p-4">{t("finance.vendor")}</th>
                <th className="p-4">{t("finance.commissionCategoryRate")}</th>
                <th className="p-4">{t("finance.expectedCommission")}</th>
                <th className="p-4">{t("finance.recordedCommission")}</th>
                <th className="p-4">{t("finance.expectedVendorEarnings")}</th>
                <th className="p-4">{t("finance.actualVendorEarnings")}</th>
                <th className="p-4">{t("finance.difference")}</th>
                <th className="p-4">{t("finance.payoutStatus")}</th>
                <th className="p-4">{t("finance.issue")}</th>
              </tr></thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {data.vendorOrderReconciliations.map((item) => (
                  <tr key={item.vendorOrderId}>
                    <td className="p-4 font-semibold">{item.orderNumber}</td>
                    <td className="p-4">{item.vendorName}</td>
                    <td className="p-4">{item.appliedRates.map(({ category, rate }) => `${category} (${rate === null ? "snapshot missing" : `${rate}%`})`).join(", ")}</td>
                    <td className="p-4">{item.expectedCommission === null ? "—" : `${item.expectedCommission} ${item.currency}`}</td>
                    <td className="p-4">{item.actualCommission} {item.currency}</td>
                    <td className="p-4">{item.expectedVendorEarnings === null ? "—" : `${item.expectedVendorEarnings} ${item.currency}`}</td>
                    <td className="p-4">{item.actualVendorEarnings} {item.currency}</td>
                    <td className="p-4">{item.difference === null ? "—" : `${item.difference} ${item.currency}`}</td>
                    <td className="p-4">{item.payoutStatus}</td>
                    <td className={`p-4 ${item.issue === "Matched" ? "text-emerald-800" : "text-red-700"}`}>
                      {item.issue === "Matched" ? t("finance.matched") : item.issue}
                    </td>
                  </tr>
                ))}
                {data.vendorOrderReconciliations.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-emerald-800">{t("finance.noDeliveredOrders")}</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {(data.paymentDiscrepancies.length > 0 || data.couponDiscrepancies.length > 0 || data.payoutDiscrepancies.length > 0) && (
            <section className="space-y-4">
              {data.paymentDiscrepancies.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <h3 className="p-4 font-bold text-amber-900">{t("finance.paymentReconciliation")}</h3>
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="border-y border-[#edf1ef] bg-[#f5f8f6] text-slate-600"><tr>
                      <th className="p-4">{t("finance.order")}</th>
                      <th className="p-4">{t("finance.expected")}</th>
                      <th className="p-4">{t("finance.paid")}</th>
                      <th className="p-4">{t("finance.issue")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#edf1ef]">
                      {data.paymentDiscrepancies.map((item) => (
                        <tr key={item.orderId}>
                          <td className="p-4 font-semibold">{item.orderNumber}</td>
                          <td className="p-4">{item.expectedAmount} {item.currency}</td>
                          <td className="p-4">{item.actualAmount} {item.currency}</td>
                          <td className="p-4 text-amber-900">{item.issue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.couponDiscrepancies.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <h3 className="p-4 font-bold text-amber-900">{t("finance.platformCouponReconciliation")}</h3>
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="border-y border-[#edf1ef] bg-[#f5f8f6] text-slate-600"><tr>
                      <th className="p-4">{t("finance.order")}</th>
                      <th className="p-4">{t("finance.coupon")}</th>
                      <th className="p-4">{t("finance.expected")}</th>
                      <th className="p-4">{t("finance.redeemed")}</th>
                      <th className="p-4">{t("finance.ledger")}</th>
                      <th className="p-4">{t("finance.issue")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#edf1ef]">
                      {data.couponDiscrepancies.map((item) => (
                        <tr key={item.orderId}>
                          <td className="p-4 font-semibold">{item.orderNumber}</td>
                          <td className="p-4">{item.couponCodes.join(", ") || "—"}</td>
                          <td className="p-4">{item.expectedAmount} {item.currency}</td>
                          <td className="p-4">{item.redeemedAmount} {item.currency}</td>
                          <td className="p-4">{item.ledgerAmount} {item.currency}</td>
                          <td className="p-4 text-amber-900">{item.issue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.payoutDiscrepancies.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <h3 className="p-4 font-bold text-amber-900">{t("finance.payoutReconciliation")}</h3>
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="border-y border-[#edf1ef] bg-[#f5f8f6] text-slate-600"><tr>
                      <th className="p-4">{t("finance.reference")}</th>
                      <th className="p-4">{t("finance.vendorOrder")}</th>
                      <th className="p-4">{t("finance.payoutStatus")}</th>
                      <th className="p-4">{t("finance.expected")}</th>
                      <th className="p-4">{t("finance.reserved")}</th>
                      <th className="p-4">{t("finance.paid")}</th>
                      <th className="p-4">{t("finance.issue")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#edf1ef]">
                      {data.payoutDiscrepancies.map((item) => (
                        <tr key={item.payoutId}>
                          <td className="p-4 font-semibold">{item.reference ?? item.payoutId}</td>
                          <td className="p-4 font-mono text-xs">{item.vendorId}</td>
                          <td className="p-4">{item.status}</td>
                          <td className="p-4">{item.expectedAmount} {item.currency}</td>
                          <td className="p-4">{item.reservedAmount} {item.currency}</td>
                          <td className="p-4">{item.recordedPayout} {item.currency}</td>
                          <td className="p-4 text-amber-900">{item.issue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[#123b35]">{t("finance.payoutTitle")}</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-[#edf1ef] text-slate-600"><tr>
                  <th className="pb-3 pe-4">{t("finance.reference")}</th>
                  <th className="pb-3 pe-4">{t("finance.payoutStatus")}</th>
                  <th className="pb-3 pe-4">{t("finance.eligibleVendors")}</th>
                  <th className="pb-3">{t("finance.totalAmount")}</th>
                </tr></thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {data.payoutBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="py-3 pe-4 font-semibold">{batch.weekKey}</td>
                      <td className="py-3 pe-4">{batch.status}</td>
                      <td className="py-3 pe-4">{batch.vendorCount}</td>
                      <td className="py-3">{formatTotals(batch.totalAmounts)}</td>
                    </tr>
                  ))}
                  {data.payoutBatches.length === 0 && <tr><td colSpan={4} className="py-5 text-center text-slate-600">{t("finance.noPayouts")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
