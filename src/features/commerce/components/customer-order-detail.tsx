"use client";

import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { getCustomerOrder } from "@/features/commerce/service";

type CustomerOrder = Awaited<ReturnType<typeof getCustomerOrder>>["order"];

export function CustomerOrderDetail({ order, locale }: Readonly<{ order: CustomerOrder; locale: Locale }>) {
  const isSomali = locale === "so";
  const timeline = [
    { title: isSomali ? "Dalabka waa la abuuray" : "Order placed", date: order.createdAt, done: true },
    { title: isSomali ? "Lacag-bixinta" : "Payment", date: order.payment?.createdAt ?? null, done: order.paymentStatus === "SUCCEEDED" || order.paymentStatus === "REVERSED" },
    { title: isSomali ? "Diyaarinta iibiyeyaasha" : "Vendor fulfillment", date: null, done: order.vendorOrders.some((vendorOrder) => !["NEW", "CANCELLED", "EXPIRED"].includes(vendorOrder.status)) },
    { title: isSomali ? "Gaarsiin" : "Delivery", date: order.vendorOrders.map((vendorOrder) => vendorOrder.deliveredAt).filter(Boolean).sort().at(-1) ?? null, done: order.vendorOrders.every((vendorOrder) => ["DELIVERED", "CANCELLED", "EXPIRED"].includes(vendorOrder.status)) },
  ];
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <Link href={`/${locale}/customer/orders`} className="text-sm font-semibold text-[#8b5e08] hover:underline">{isSomali ? "Ku noqo dalabyada" : "Back to orders"}</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#123b35]">{isSomali ? "Dalab" : "Order"} {order.orderNumber}</h1>
          <p className="mt-1 text-sm text-slate-600">{new Date(order.createdAt).toLocaleString(locale)}</p>
        </div>
        <span className="rounded-full bg-[#f1f5f3] px-4 py-2 text-sm font-bold text-[#123b35]">{order.status.replaceAll("_", " ")}</span>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="grid content-start gap-5">
          {order.vendorOrders.map((vendorOrder) => (
            <section key={vendorOrder.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 shadow-sm sm:p-5">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ece9] pb-4">
                <div className="flex items-center gap-3">
                  {vendorOrder.logoFileId
                    ? <Image src={`/api/v1/vendors/${vendorOrder.vendorId}/logo`} alt="" width={48} height={48} unoptimized className="size-12 rounded-xl object-cover" />
                    : <span className="grid size-12 place-items-center rounded-xl bg-[#123b35] text-lg font-bold text-[#f4b942]">{(vendorOrder.storeName ?? "S").slice(0, 1)}</span>}
                  <div>
                    <Link href={`/${locale}/stores/${vendorOrder.vendorId}`} className="font-bold text-[#123b35] hover:underline">{vendorOrder.storeName ?? (isSomali ? "Dukaan" : "Store")}</Link>
                    <p className="text-sm text-slate-600">{isSomali ? "Dalab-hoosaad" : "Vendor order"} · {vendorOrder.status.replaceAll("_", " ")}</p>
                  </div>
                </div>
                <p className="font-bold">${vendorOrder.subtotal}</p>
              </header>
              <ul className="divide-y divide-[#edf1ef]">
                {vendorOrder.lines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center gap-3 py-4">
                    {line.imageId
                      ? <Image src={`/api/v1/products/images/${line.imageId}`} alt={isSomali ? line.productNameSo ?? line.productName : line.productName} width={72} height={72} unoptimized className="size-[72px] rounded-xl bg-[#f5f8f6] object-cover" />
                      : <div className="grid size-[72px] place-items-center rounded-xl bg-[#f5f8f6] text-xs text-slate-500">{isSomali ? "Sawir ma jiro" : "No image"}</div>}
                    <div className="min-w-[12rem] flex-1">
                      <Link href={`/${locale}/marketplace/${line.productId}`} className="font-semibold text-[#123b35] hover:underline">{isSomali ? line.productNameSo ?? line.productName : line.productName}</Link>
                      <p className="text-sm text-slate-600">{line.variantName} · {isSomali ? "Tiro" : "Qty"} {line.quantity} · ${line.unitPrice} {isSomali ? "midkiiba" : "each"}</p>
                      {line.review && <p className="mt-1 text-xs text-slate-500">{isSomali ? "Qiimayntaada" : "Your review"}: {"★".repeat(line.review.rating)}</p>}
                    </div>
                    <div className="w-full space-y-2 sm:w-auto">
                      {line.returns.map((request) => (
                        <div key={request.id} className="rounded-lg bg-[#f5f8f6] p-3 text-xs">
                          <p className="font-semibold">{isSomali ? "Celinta" : "Return"} · {request.status.replaceAll("_", " ")} · {request.quantity} {isSomali ? "xabbo" : "item(s)"}</p>
                          <p className="mt-1">{request.reason.replaceAll("_", " ")}</p>
                          {request.explanation && <p className="mt-1 text-slate-600">{request.explanation}</p>}
                          {request.photoKey && <a href={`/api/v1/returns/${request.id}/photo`} target="_blank" rel="noreferrer" className="mt-1 block font-semibold text-[#8b5e08] underline">{isSomali ? "Eeg sawirka caddaynta" : "View supporting photo"}</a>}
                          {request.vendorNote && <p className="mt-1 text-slate-600">{request.vendorNote}</p>}
                          {request.returnInstructions && <p className="mt-1 text-[#123b35]">{isSomali ? "Tilmaamaha celinta" : "Return instructions"}: {request.returnInstructions}</p>}
                          {request.refund && <p className="mt-1 font-semibold text-amber-800">{isSomali ? "Soo celin tijaabo ah" : "Simulated refund"}: ${request.refund.amount}; {isSomali ? "lacag dhab ah lama wareejin" : "no real money transferred"}</p>}
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {vendorOrder.status === "SHIPPED" && (
                <div className="mt-2 rounded-xl bg-[#f5f8f6] p-3 text-sm">
                  <p>{vendorOrder.courier ?? (isSomali ? "Gaarsiin" : "Courier")}{vendorOrder.trackingNumber ? ` · ${vendorOrder.trackingNumber}` : ""}</p>
                  {vendorOrder.expectedDelivery && <p className="mt-1 text-slate-600">{isSomali ? "Gaarsiin la filayo" : "Expected delivery"}: {new Date(vendorOrder.expectedDelivery).toLocaleString(locale)}</p>}
                  {vendorOrder.deliveryNote && <p className="mt-1 text-slate-600">{vendorOrder.deliveryNote}</p>}
                </div>
              )}
              {vendorOrder.deliveredAt && <p className="mt-3 text-xs text-slate-500">{isSomali ? "La gaarsiiyey" : "Delivered"}: {new Date(vendorOrder.deliveredAt).toLocaleString(locale)}</p>}
            </section>
          ))}
          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
            <h2 className="font-bold text-[#123b35]">{isSomali ? "Xaaladda dalabka" : "Order timeline"}</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {timeline.map((item) => (
                <li key={item.title} className="flex gap-3 rounded-xl bg-[#f5f8f6] p-3">
                  <span className={`mt-1 size-3 shrink-0 rounded-full ${item.done ? "bg-[#20815c]" : "bg-slate-300"}`} />
                  <span><span className="block text-sm font-semibold">{item.title}</span>{item.date && <time className="mt-1 block text-xs text-slate-500">{new Date(item.date).toLocaleString(locale)}</time>}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
            <h2 className="font-bold text-[#123b35]">{isSomali ? "Lacag-bixinta" : "Payment"}</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-600">{isSomali ? "Xaalad" : "Status"}</dt><dd className="font-semibold">{order.paymentStatus.replaceAll("_", " ")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-600">{isSomali ? "Wadarta" : "Total"}</dt><dd className="font-semibold">${order.total} {order.currency}</dd></div>
              {order.payment?.method && <div className="flex justify-between gap-2"><dt className="text-slate-600">{isSomali ? "Habka" : "Method"}</dt><dd>{order.payment.method.replaceAll("_", " ")}</dd></div>}
              {order.receipt && <div><dt className="text-slate-600">{isSomali ? "Rasiid" : "Receipt"}</dt><dd className="font-mono font-semibold">{order.receipt.receiptNumber}</dd></div>}
            </dl>
            {order.simulated && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{isSomali ? "Lacag-bixintani waa tijaabo; lacag dhab ah lama wareejin." : "This payment is simulated; no real mobile money was transferred."}</p>}
            {order.receipt && <Link href={`/${locale}/customer/orders/${order.id}/receipt`} className="mt-3 inline-block text-sm font-semibold text-[#8b5e08]">{isSomali ? "Fur rasiidka" : "View payment receipt"}</Link>}
          </section>
          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
            <h2 className="font-bold text-[#123b35]">{isSomali ? "Cinwaanka gaarsiinta" : "Delivery address"}</h2>
            <p className="mt-3 text-sm font-semibold">{order.contactName}</p>
            <p className="mt-1 text-sm text-slate-600">{order.phone}</p>
            <p className="mt-1 text-sm text-slate-600">{[order.address, order.district, order.city, order.region, order.country].filter(Boolean).join(", ")}</p>
            {order.instructions && <p className="mt-3 rounded-lg bg-[#f5f8f6] p-3 text-sm"><span className="font-semibold">{isSomali ? "Fariinta gaarsiinta" : "Delivery notes"}:</span> {order.instructions}</p>}
          </section>
          <Link href={`/${locale}/customer/orders`} className="rounded-xl border border-[#d5dfda] px-4 py-3 text-center text-sm font-semibold text-[#123b35]">{isSomali ? "Qiimee ama codso celin" : "Review or request a return"}</Link>
        </aside>
      </div>
    </main>
  );
}
