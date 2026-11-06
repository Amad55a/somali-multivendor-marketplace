"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";

const previewSchema = z.object({
  cutoff: z.string(),
  totalAmounts: z.array(z.object({ currency: z.string(), amount: z.string() })),
  vendorCount: z.number(),
  payouts: z.array(z.object({
    vendorId: z.string(),
    storeName: z.string().nullable(),
    vendorName: z.string().nullable(),
    email: z.string().nullable(),
    currency: z.string(),
    amount: z.string(),
    orderCount: z.number(),
    entryCount: z.number(),
  })),
  pendingPayouts: z.array(z.object({
    vendorId: z.string(),
    storeName: z.string().nullable(),
    vendorName: z.string().nullable(),
    currency: z.string(),
    amount: z.string(),
    orderCount: z.number(),
    nextEligibleAt: z.string().nullable(),
    awaitingDelivery: z.boolean(),
  })),
});

const batchesSchema = z.object({
  batches: z.array(z.object({
    id: z.string(),
    weekKey: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    status: z.string(),
    createdAt: z.string(),
    approvedAt: z.string().nullable(),
    processedAt: z.string().nullable(),
    totalAmounts: z.array(z.object({ currency: z.string(), amount: z.string() })),
    vendorCount: z.number(),
    payouts: z.array(z.object({
      id: z.string(),
      vendorId: z.string(),
      vendorName: z.string(),
      reference: z.string().nullable(),
      amount: z.string(),
      currency: z.string(),
      status: z.string(),
      failureReason: z.string().nullable(),
      grossSales: z.string(),
      commission: z.string(),
      vendorDiscounts: z.string(),
      refunds: z.string(),
      deliveryFees: z.string(),
    })),
  })),
});

type Preview = z.infer<typeof previewSchema>;
type Batch = z.infer<typeof batchesSchema>["batches"][number];
const isDevelopmentBuild = process.env.NODE_ENV !== "production";

function formatAmount(value: string, currency: string) {
  const amount = Number(value);
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
}

function formatTotals(totals: Array<{ currency: string; amount: string }>) {
  return totals.map(({ currency, amount }) => formatAmount(amount, currency)).join(" · ") || formatAmount("0.00", "USD");
}

export function AdminPayoutManager() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [useDevelopmentHoldOverride, setUseDevelopmentHoldOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const holdDays = isDevelopmentBuild && useDevelopmentHoldOverride ? 0 : undefined;
  const previewUrl = holdDays === undefined
    ? "/api/v1/admin/payouts/preview"
    : `/api/v1/admin/payouts/preview?holdDays=${holdDays}`;

  const refresh = useCallback(async () => {
    const [previewResult, batchResult] = await Promise.all([
      requestApi(previewUrl, previewSchema, t("finance.requestFailed")),
      requestApi("/api/v1/admin/payouts", batchesSchema, t("finance.requestFailed")),
    ]);
    setPreview(previewResult);
    setBatches(batchResult.batches);
  }, [previewUrl, t]);

  useEffect(() => {
    let active = true;
    Promise.all([
      requestApi(previewUrl, previewSchema, t("finance.requestFailed")),
      requestApi("/api/v1/admin/payouts", batchesSchema, t("finance.requestFailed")),
    ])
      .then(([previewResult, batchResult]) => {
        if (!active) return;
        setPreview(previewResult);
        setBatches(batchResult.batches);
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
  }, [previewUrl, t]);

  async function createBatch() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        "/api/v1/admin/payouts/batches",
        z.object({ id: z.string() }).passthrough(),
        t("finance.requestFailed"),
        postJson(holdDays === undefined ? {} : { holdDays }),
      );
      await refresh();
      setNotice(t("finance.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function updateBatch(batchId: string, action: "approve" | "cancel" | "retry") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        action === "retry"
          ? `/api/v1/admin/payouts/${batchId}/retry`
          : `/api/v1/admin/payouts/batches/${batchId}/${action}`,
        z.object({}).passthrough(),
        t("finance.requestFailed"),
        postJson(action === "cancel" || holdDays === undefined ? {} : { holdDays }),
      );
      await refresh();
      setNotice(t("finance.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = batches.filter((batch) => batch.status === "PENDING").length;
  const processedCount = batches.filter((batch) => batch.status === "SIMULATED_PAID").length;
  const failedCount = batches.reduce((count, batch) => count + batch.payouts.filter((payout) => payout.status === "FAILED").length, 0);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-[#123b35]">{t("finance.payoutTitle")}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t("finance.payoutDescription")}</p>
        <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t("finance.simulatedNotice")}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t("finance.totalAmount"), preview ? formatTotals(preview.totalAmounts) : "—"],
          [t("finance.eligibleVendors"), preview?.vendorCount ?? "—"],
          [t("finance.pendingBatch"), pendingCount],
          [t("finance.processedBatch"), processedCount],
          [t("finance.failedPayouts"), failedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#123b35]">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#123b35]">{t("finance.previewBalances")}</h3>
            {preview && <p className="mt-1 text-xs text-slate-500">{t("finance.deliveryCutoff")}: {new Date(preview.cutoff).toLocaleString()}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || loading} onClick={() => void refresh()} className="rounded-xl border border-[#dce4e1] px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {t("finance.previewBalances")}
            </button>
            <button type="button" disabled={busy || loading} onClick={() => void createBatch()} className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {t("finance.createBatch")}
            </button>
          </div>
        </div>
        {isDevelopmentBuild && (
          <label className="mt-4 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={useDevelopmentHoldOverride}
              onChange={(event) => setUseDevelopmentHoldOverride(event.target.checked)}
              className="mt-1"
            />
            <span>{t("finance.developmentHoldOverride")}</span>
          </label>
        )}
        {loading ? <p className="mt-5 text-sm text-slate-600">{t("finance.loading")}</p> : !preview || (!preview.payouts.length && !preview.pendingPayouts.length) ? (
          <p className="mt-5 text-sm text-slate-600">{t("finance.noPayouts")}</p>
        ) : (
          <div className="mt-5 space-y-6">
            {preview.payouts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[#edf1ef] text-slate-600"><tr>
                    <th className="pb-3 pe-4">{t("finance.vendorOrder")}</th>
                    <th className="pb-3 pe-4">Email</th>
                    <th className="pb-3 pe-4">{t("finance.coveredOrders")}</th>
                    <th className="pb-3">{t("finance.amount")}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {preview.payouts.map((payout) => (
                      <tr key={`${payout.vendorId}-${payout.currency}`}>
                        <td className="py-3 pe-4 font-semibold">{payout.storeName ?? payout.vendorName ?? payout.vendorId}</td>
                        <td className="py-3 pe-4 text-slate-600">{payout.email ?? "—"}</td>
                        <td className="py-3 pe-4 text-slate-600">{payout.orderCount}</td>
                        <td className="py-3 font-semibold">{formatAmount(payout.amount, payout.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-600">{t("finance.noPayouts")}</p>
            )}
            {preview.pendingPayouts.length > 0 && (
              <div className="overflow-x-auto">
                <h4 className="mb-3 font-semibold text-[#123b35]">{t("finance.pendingEarnings")}</h4>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[#edf1ef] text-slate-600"><tr>
                    <th className="pb-3 pe-4">{t("finance.vendor")}</th>
                    <th className="pb-3 pe-4">{t("finance.coveredOrders")}</th>
                    <th className="pb-3 pe-4">{t("finance.amount")}</th>
                    <th className="pb-3">{t("finance.nextEligibility")}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {preview.pendingPayouts.map((payout) => (
                      <tr key={`${payout.vendorId}-${payout.currency}`}>
                        <td className="py-3 pe-4 font-semibold">{payout.storeName ?? payout.vendorName ?? payout.vendorId}</td>
                        <td className="py-3 pe-4">{payout.orderCount}</td>
                        <td className="py-3 pe-4">{formatAmount(payout.amount, payout.currency)}</td>
                        <td className="py-3">
                          {payout.awaitingDelivery ? t("finance.awaitingDelivery") : payout.nextEligibleAt ? new Date(payout.nextEligibleAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-bold text-[#123b35]">{t("finance.processedBatch")}</h3>
        {batches.length === 0 && !loading && <p className="rounded-xl bg-white p-5 text-sm text-slate-600">{t("finance.noPayouts")}</p>}
        {batches.map((batch) => (
          <BatchCard key={batch.id} batch={batch} busy={busy} onUpdate={updateBatch} />
        ))}
      </section>
    </section>
  );
}

function BatchCard({
  batch,
  busy,
  onUpdate,
}: {
  batch: Batch;
  busy: boolean;
  onUpdate: (batchId: string, action: "approve" | "cancel" | "retry") => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <article className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="font-bold text-[#123b35]">{batch.weekKey} · {batch.status}</h4>
          <p className="mt-1 text-sm text-slate-600">{new Date(batch.periodStart).toLocaleDateString()} – {new Date(batch.periodEnd).toLocaleDateString()}</p>
          <p className="mt-1 text-sm">{t("finance.totalAmount")}: <strong>{formatTotals(batch.totalAmounts)}</strong> · {t("finance.eligibleVendors")}: {batch.vendorCount}</p>
        </div>
        {batch.status === "PENDING" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdate(batch.id, "approve")}
              className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t("finance.approveSimulated")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdate(batch.id, "cancel")}
              className="rounded-xl border border-[#dce4e1] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {t("finance.cancelBatch")}
            </button>
          </div>
        )}
      </div>
      {batch.payouts.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-[#edf1ef] text-slate-600"><tr>
              <th className="pb-2 pe-4">{t("finance.vendor")}</th>
              <th className="pb-2 pe-4">{t("finance.totalSales")}</th>
              <th className="pb-2 pe-4">{t("finance.totalCommission")}</th>
              <th className="pb-2 pe-4">{t("finance.vendorDiscounts")}</th>
              <th className="pb-2 pe-4">{t("finance.totalRefunds")}</th>
              <th className="pb-2 pe-4">{t("finance.deliveryFees")}</th>
              <th className="pb-2 pe-4">{t("finance.amount")}</th>
              <th className="pb-2 pe-4">{t("finance.reference")}</th>
              <th className="pb-2">{t("finance.payoutStatus")}</th>
            </tr></thead>
            <tbody className="divide-y divide-[#edf1ef]">
              {batch.payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="py-2 pe-4 font-medium">{payout.vendorName}</td>
                  <td className="py-2 pe-4">{formatAmount(payout.grossSales, payout.currency)}</td>
                  <td className="py-2 pe-4">{formatAmount(payout.commission, payout.currency)}</td>
                  <td className="py-2 pe-4">{formatAmount(payout.vendorDiscounts, payout.currency)}</td>
                  <td className="py-2 pe-4">{formatAmount(payout.refunds, payout.currency)}</td>
                  <td className="py-2 pe-4">{formatAmount(payout.deliveryFees, payout.currency)}</td>
                  <td className="py-2 pe-4 font-semibold">{formatAmount(payout.amount, payout.currency)}</td>
                  <td className="py-2 pe-4 text-slate-600">{payout.reference ?? "—"}</td>
                  <td className="py-2">
                    {payout.status}{payout.failureReason ? ` · ${payout.failureReason}` : ""}
                    {payout.status === "FAILED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onUpdate(payout.id, "retry")}
                        className="ms-2 rounded-lg border border-[#dce4e1] px-2 py-1 text-xs font-semibold disabled:opacity-60"
                      >
                        {t("finance.retryFailed")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
