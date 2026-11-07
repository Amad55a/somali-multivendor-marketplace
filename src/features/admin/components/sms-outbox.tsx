"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";

const outboxSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    recipient: z.string(),
    message: z.string(),
    messageType: z.string(),
    status: z.enum(["QUEUED", "SAVED_TO_OUTBOX", "FAILED_TO_SAVE"]),
    deliveryMode: z.string(),
    error: z.string().nullable(),
    createdAt: z.string(),
    order: z.object({ id: z.string(), orderNumber: z.string() }).nullable(),
    payment: z.object({ id: z.string(), status: z.string(), transactionReference: z.string().nullable() }).nullable(),
  })),
});

type Filters = { search: string; messageType: string; status: string; from: string; to: string };

export function SmsOutbox({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ search: "", messageType: "", status: "", from: "", to: "" });
  const [items, setItems] = useState<z.infer<typeof outboxSchema>["messages"]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const somali = locale === "so";

  async function load(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams();
    if (filters.search) query.set("search", filters.search);
    if (filters.messageType) query.set("messageType", filters.messageType);
    if (filters.status) query.set("status", filters.status);
    if (filters.from) query.set("from", new Date(`${filters.from}T00:00:00.000Z`).toISOString());
    if (filters.to) query.set("to", new Date(`${filters.to}T23:59:59.999Z`).toISOString());
    try {
      const response = await requestApi(`/api/v1/admin/sms-outbox?${query}`, outboxSchema, t("auth.requestFailed"));
      setItems(response.messages);
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }

  const copy = somali
    ? {
        title: "Sanduuqa SMS-ka",
        description: "Farriimahani waa kuwo kaydsan oo keliya; telefoon laguma dirin.",
        search: "Ka raadi lambarka qaataha",
        type: "Nooca farriinta",
        status: "Xaaladda",
        from: "Laga bilaabo",
        to: "Ilaa",
        all: "Dhammaan",
        filter: "Shaandhee",
        recipient: "Qaataha",
        content: "Nuxurka farriinta",
        related: "Diiwaannada la xiriira",
        error: "Khalad",
        empty: "Ma jiraan farriimo sanduuqa ku jira.",
        noExternal: "Dirista SMS-ka dhabta ah lama heli karo.",
        order: "Dalab",
        payment: "Lacag-bixin",
      }
    : {
        title: "SMS Outbox",
        description: "These messages are saved only; they have not been sent to a phone.",
        search: "Search recipient",
        type: "Message type",
        status: "Status",
        from: "From date",
        to: "To date",
        all: "All",
        filter: "Filter",
        recipient: "Recipient",
        content: "Message content",
        related: "Related records",
        error: "Error",
        empty: "No messages found in the outbox.",
        noExternal: "Real SMS sending is not available.",
        order: "Order",
        payment: "Payment",
      };

  return (
    <section>
      <h1 className="text-3xl font-bold text-[#123b35]">{copy.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{copy.description} {copy.noExternal}</p>
      <form onSubmit={(event) => void load(event)} className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.search}
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} className="rounded-lg border px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">{copy.type}
          <select value={filters.messageType} onChange={(event) => setFilters({ ...filters, messageType: event.target.value })} className="rounded-lg border px-3 py-2 font-normal">
            <option value="">{copy.all}</option>
            {["PAYMENT_SUCCESS", "PAYMENT_FAILED", "ORDER_CONFIRMATION", "ORDER_STATUS", "SHIPMENT_UPDATE", "DELIVERY_CONFIRMATION", "REFUND_STATUS"].map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{copy.status}
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-lg border px-3 py-2 font-normal">
            <option value="">{copy.all}</option>
            {["QUEUED", "SAVED_TO_OUTBOX", "FAILED_TO_SAVE"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{copy.from}<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">{copy.to}<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <button disabled={loading} className="self-end rounded-xl bg-[#123b35] px-4 py-2 font-semibold text-white disabled:opacity-50">{copy.filter}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600">{t("header.searchLoading")}</p>}
      {loaded && !loading && (
        <div className="mt-6 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">{item.messageType} · {item.status}</p>
                <time className="text-sm text-slate-500">{new Date(item.createdAt).toLocaleString(locale)}</time>
              </div>
              <p className="mt-2 text-sm">{copy.recipient}: <span className="font-mono">{item.recipient}</span></p>
              <p className="mt-1 text-xs text-slate-500">{item.deliveryMode} · {copy.noExternal}</p>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{item.message}</p>
              {item.error && <p className="mt-2 text-sm text-red-700">{copy.error}: {item.error}</p>}
              {(item.order || item.payment) && (
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {item.order && <span>{copy.order}: {item.order.orderNumber}</span>}
                  {item.payment && <Link className="font-semibold text-[#8b5e08]" href={`/${locale}/admin/payments/${item.payment.id}`}>{copy.payment}: {item.payment.status}</Link>}
                </div>
              )}
            </article>
          ))}
          {items.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{copy.empty}</p>}
        </div>
      )}
    </section>
  );
}
