"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const historySchema = z.object({
  payments: z.array(z.object({
    id: z.string(),
    date: z.string(),
    method: z.string().nullable(),
    phone: z.string().nullable(),
    amount: z.string(),
    currency: z.string(),
    status: z.string(),
    transactionReference: z.string().nullable(),
    simulated: z.boolean(),
    orderId: z.string().nullable(),
    orderNumber: z.string().nullable(),
    receiptId: z.string().nullable(),
    receiptNumber: z.string().nullable(),
  })),
});

export function CustomerPaymentHistory({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<z.infer<typeof historySchema>["payments"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPayments = useCallback(async () => {
    try {
      const { payments: result } = await requestApi("/api/v1/customer/payments", historySchema, t("auth.requestFailed"));
      setPayments(result);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useVisiblePolling(loadPayments, 30_000);

  const copy = locale === "so"
    ? {
        title: "Taariikhda lacag-bixinta",
        simulated: "LACAG-BIXIN TIJAABO AH — LACAG DHAB AH LAMA WAREEJIN",
        reference: "Tixraaca dalabka",
        receipt: "Eeg rasiidka",
        empty: "Weli ma jiraan lacag-bixinno.",
        loading: "Waa la soo rarayaa...",
      }
    : {
        title: "Payment history",
        simulated: "SIMULATED PAYMENT — NO REAL MONEY TRANSFERRED",
        reference: "Order reference",
        receipt: "View receipt",
        empty: "No payment attempts yet.",
        loading: "Loading...",
      };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-[#123b35]">{copy.title}</h1>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-6 text-sm text-slate-600">{copy.loading}</p> : (
        <div className="mt-6 grid gap-3">
          {payments.map((payment) => (
            <article key={payment.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
              <p className="font-semibold">{payment.method?.replace("_", " ") ?? "Mobile money"} · {payment.currency} {payment.amount} · {payment.status}</p>
              <p className="mt-1 text-sm text-slate-600">{new Date(payment.date).toLocaleString(locale)} · {payment.phone ?? ""}</p>
              {payment.orderNumber && <p className="mt-1 text-sm">{copy.reference}: {payment.orderNumber}</p>}
              {payment.transactionReference && <p className="mt-1 break-all font-mono text-xs text-slate-600">{payment.transactionReference}</p>}
              <p className="mt-3 text-xs font-bold text-amber-800">{copy.simulated}</p>
              {payment.orderId && payment.receiptId && (
                <Link href={`/${locale}/customer/orders/${payment.orderId}/receipt`} className="mt-3 inline-block font-semibold text-[#8b5e08]">
                  {copy.receipt} · {payment.receiptNumber}
                </Link>
              )}
            </article>
          ))}
          {payments.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-slate-600">{copy.empty}</p>}
        </div>
      )}
    </main>
  );
}
