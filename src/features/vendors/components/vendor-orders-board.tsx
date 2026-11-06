"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  orderNumber: z.string(),
  customer: z.string(),
  phone: z.string(),
  city: z.string(),
  address: z.string(),
  createdAt: z.string(),
  paymentStatus: z.string(),
  simulated: z.boolean(),
  subtotal: z.string(),
  confirmBy: z.string(),
  courier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  lines: z.array(z.object({
    id: z.string(),
    productName: z.string(),
    variantName: z.string(),
    sku: z.string(),
    quantity: z.number(),
    unitPrice: z.string(),
  })),
});

const statuses = ["", "NEW", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "EXPIRED"] as const;
const nextAction: Record<string, { status: string; label: string } | undefined> = {
  NEW: { status: "CONFIRMED", label: "Confirm" },
  CONFIRMED: { status: "PACKED", label: "Pack" },
  PACKED: { status: "SHIPPED", label: "Ship" },
  SHIPPED: { status: "DELIVERED", label: "Delivered" },
};

export function VendorOrdersBoard() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<z.infer<typeof orderSchema>[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const result = await requestApi("/api/v1/vendor/orders", z.object({ orders: z.array(orderSchema) }), t("auth.requestFailed"));
      setOrders(result.orders);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadOrders, 30_000);

  const counts = statuses.slice(1).map((item) => ({
    status: item,
    count: orders.filter((order) => order.status === item).length,
  }));
  const visible = orders.filter((order) =>
    (!status || order.status === status) &&
    (!search || order.orderNumber.toLowerCase().includes(search.toLowerCase()) || order.customer.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <section>
      <h2 className="text-3xl font-bold">{t("vendor.ordersTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">Confirm new sub-orders within 24 hours. Unconfirmed simulated orders expire and restore stock.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map((item) => (
          <button key={item.status} type="button" onClick={() => setStatus(item.status)} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 text-start">
            <p className="text-xs font-semibold uppercase text-slate-500">{item.status}</p>
            <p className="mt-1 text-2xl font-bold">{item.count}</p>
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("vendor.searchPlaceholder")} className="rounded-xl border px-3 py-2" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border px-3 py-2">
          <option value="">All</option>
          {statuses.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="mt-6 grid gap-4">
        {visible.map((order) => {
          const action = nextAction[order.status];
          return (
            <article key={order.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono font-bold">{order.orderNumber}</p>
                  <p className="text-sm text-slate-600">{order.customer} · {order.phone} · {order.city}</p>
                  <p className="text-xs text-slate-500">{order.address}</p>
                  {order.simulated && <p className="mt-1 text-xs text-amber-800">{t("shop.simulatedPayment")}</p>}
                </div>
                <div className="text-end">
                  <p className="rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-semibold">{order.status}</p>
                  <p className="mt-2 font-bold">${order.subtotal}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {order.lines.map((line) => (
                  <li key={line.id}>{line.productName} · {line.variantName} × {line.quantity} · ${line.unitPrice}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {action && (
                  <button type="button" onClick={() => void requestApi(`/api/v1/vendor/orders/${order.id}/status`, z.object({ orders: z.array(orderSchema) }), t("auth.requestFailed"), postJson({ status: action.status })).then((result) => setOrders(result.orders))} className="rounded-xl bg-[#123b35] px-3 py-2 text-sm font-semibold text-white">
                    {action.label}
                  </button>
                )}
                {order.status === "NEW" && (
                  <button type="button" onClick={() => void requestApi(`/api/v1/vendor/orders/${order.id}/status`, z.object({ orders: z.array(orderSchema) }), t("auth.requestFailed"), postJson({ status: "CANCELLED" })).then((result) => setOrders(result.orders))} className="rounded-xl border px-3 py-2 text-sm font-semibold">
                    Reject
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {visible.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{t("vendor.noOrdersTitle")}</p>}
      </div>
    </section>
  );
}
