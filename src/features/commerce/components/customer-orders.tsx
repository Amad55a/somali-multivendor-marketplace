"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postFormData, requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const returnSchema = z.object({
  id: z.string(),
  status: z.string(),
  quantity: z.number(),
  reason: z.string(),
  explanation: z.string(),
  photoKey: z.string().nullable(),
  vendorNote: z.string().nullable(),
  returnInstructions: z.string().nullable(),
  adminNote: z.string().nullable(),
  disputeResolution: z.string().nullable(),
  reviewedByAdminAt: z.string().nullable(),
  disputeUpdates: z.array(z.object({
    id: z.string(),
    authorRole: z.string(),
    kind: z.string(),
    content: z.string(),
    requestedFrom: z.string().nullable(),
    createdAt: z.string(),
  })),
  createdAt: z.string(),
  refund: z.object({ id: z.string(), amount: z.string(), simulated: z.boolean() }).nullable(),
});
const lineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productNameSo: z.string().nullable(),
  variantName: z.string(),
  sku: z.string(),
  quantity: z.number(),
  unitPrice: z.string(),
  imageId: z.string().nullable(),
  review: z.object({
    id: z.string(),
    rating: z.number(),
    comment: z.string().nullable(),
    createdAt: z.string(),
  }).nullable(),
  returns: z.array(returnSchema),
});
const ordersSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    orderNumber: z.string(),
    status: z.string(),
    total: z.string(),
    simulated: z.boolean(),
    paymentStatus: z.string(),
    receipt: z.object({ id: z.string(), receiptNumber: z.string() }).nullable(),
    createdAt: z.string(),
    vendorOrders: z.array(z.object({
      id: z.string(),
      vendorId: z.string(),
      status: z.string(),
      storeName: z.string().nullable(),
      logoFileId: z.string().nullable(),
      subtotal: z.string(),
      trackingNumber: z.string().nullable(),
      courier: z.string().nullable(),
      deliveryNote: z.string().nullable(),
      expectedDelivery: z.string().nullable(),
      deliveredAt: z.string().nullable(),
      lines: z.array(lineSchema),
    })),
  })),
});

type Order = z.infer<typeof ordersSchema>["orders"][number];
type OrderLine = z.infer<typeof lineSchema>;
type OrderStatus = "" | "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "RETURNS" | "REFUNDED";
const statusOptions: Array<{ value: OrderStatus; english: string; somali: string }> = [
  { value: "", english: "All orders", somali: "Dhammaan dalabyada" },
  { value: "PENDING", english: "Pending", somali: "Sugaya" },
  { value: "PROCESSING", english: "Processing", somali: "La diyaarinayo" },
  { value: "SHIPPED", english: "Shipped", somali: "La soo diray" },
  { value: "DELIVERED", english: "Delivered", somali: "La gaarsiiyey" },
  { value: "CANCELLED", english: "Cancelled", somali: "La joojiyey" },
  { value: "RETURNS", english: "Returns", somali: "Celinnada" },
  { value: "REFUNDED", english: "Refunded", somali: "Lacag celin" },
];
const returnReasons = [
  ["DAMAGED_PRODUCT", "Damaged product", "Alaab dhaawacantay"],
  ["WRONG_PRODUCT", "Wrong product received", "Alaab khaldan ayaa la helay"],
  ["NOT_AS_DESCRIBED", "Product not as described", "Alaabtu sida lagu sheegay ma aha"],
  ["MISSING_PARTS", "Missing parts or accessories", "Qaybo ama agab ayaa maqan"],
  ["INCORRECT_VARIANT", "Incorrect size or color", "Cabbir ama midab khaldan"],
  ["OTHER", "Other", "Sabab kale"],
] as const;
const outstandingReturnStatuses = new Set(["REQUESTED", "VENDOR_APPROVED", "RETURN_SHIPPED", "ESCALATED", "IN_REVIEW", "ADMIN_APPROVED", "RECEIVED", "REFUND_PROCESSING"]);
const consumedReturnStatuses = new Set([...outstandingReturnStatuses, "RETURNED", "REFUNDED"]);

function isWithinReturnWindow(deliveredAt: string | null) {
  if (!deliveredAt) return false;
  const delivered = new Date(deliveredAt);
  const today = new Date();
  const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const elapsedDays = (day(today) - day(delivered)) / 86_400_000;
  return elapsedDays >= 0 && elapsedDays <= 7;
}

export function CustomerOrders({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ line: OrderLine; order: Order } | null>(null);
  const [returnTarget, setReturnTarget] = useState<{ line: OrderLine; order: Order; deliveredAt: string | null } | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null);
  const [reason, setReason] = useState<(typeof returnReasons)[number][0]>("DAMAGED_PRODUCT");
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [returnPhoto, setReturnPhoto] = useState<File | null>(null);
  const [disputeMessages, setDisputeMessages] = useState<Record<string, string>>({});

  const loadOrders = useCallback(async () => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("status", status);
    try {
      const suffix = query.size ? `?${query}` : "";
      const result = await requestApi(`/api/v1/customer/orders${suffix}`, ordersSchema, t("auth.requestFailed"));
      setOrders(result.orders);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, status, t]);
  useVisiblePolling(loadOrders, 30_000);

  function localizedName(line: OrderLine) {
    return locale === "so" ? line.productNameSo ?? line.productName : line.productName;
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("orderLineId", reviewTarget.line.id);
    form.set("rating", String(rating));
    form.set("comment", comment);
    if (reviewPhoto) form.set("photo", reviewPhoto);
    try {
      await requestApi(`/api/v1/products/${reviewTarget.line.productId}/reviews`, z.object({ review: z.any() }), t("auth.requestFailed"), postFormData(form));
      setReviewTarget(null);
      setComment("");
      setReviewPhoto(null);
      setMessage(locale === "so" ? "Qiimayntaada waa la gudbiyey." : "Your review was submitted.");
      window.dispatchEvent(new Event("customer-notifications-updated"));
      await loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returnTarget) return;
    const confirm = window.confirm(locale === "so" ? "Ma gudbinaysaa codsigan celinta?" : "Submit this return request?");
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("orderLineId", returnTarget.line.id);
    form.set("reason", reason);
    form.set("explanation", explanation);
    form.set("quantity", String(returnQuantity));
    if (returnPhoto) form.set("photo", returnPhoto);
    try {
      await requestApi("/api/v1/returns", z.object({ returnRequest: z.any() }), t("auth.requestFailed"), postFormData(form));
      setReturnTarget(null);
      setExplanation("");
      setReturnPhoto(null);
      setMessage(locale === "so" ? "Codsiga celinta waa la gudbiyey." : "Your return request was submitted.");
      window.dispatchEvent(new Event("customer-notifications-updated"));
      await loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function advanceReturn(returnId: string, action: "ESCALATE" | "RETURN_SHIPPED") {
    const confirm = window.confirm(locale === "so" ? "Ma xaqiijinaysaa tallaabadan?" : "Confirm this return action?");
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await requestApi(`/api/v1/returns/${returnId}/action`, z.object({ returnRequest: z.any() }), t("auth.requestFailed"), {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadOrders();
      window.dispatchEvent(new Event("customer-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }

  }

  async function sendDisputeMessage(returnId: string) {
    const note = disputeMessages[returnId]?.trim();
    if (!note) {
      setError(locale === "so" ? "Farriin geli ka hor dirista." : "Enter a message before sending.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestApi(`/api/v1/returns/${returnId}/action`, z.object({ returnRequest: z.any() }), t("auth.requestFailed"), {
        method: "POST",
        body: JSON.stringify({ action: "DISPUTE_MESSAGE", note }),
      });
      setDisputeMessages((current) => ({ ...current, [returnId]: "" }));
      setMessage(locale === "so" ? "Farriinta waa la keydiyey." : "Your dispute message was saved.");
      await loadOrders();
      window.dispatchEvent(new Event("customer-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelivery(vendorOrderId: string) {
    const confirm = window.confirm(locale === "so" ? "Ma xaqiijinaysaa in dalabka la gaarsiiyey?" : "Confirm that this order was delivered?");
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await requestApi(`/api/v1/customer/orders/${vendorOrderId}/confirm-delivery`, z.object({ order: z.any() }), t("auth.requestFailed"), { method: "POST", body: JSON.stringify({}) });
      await loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  const buttonClass = "rounded-lg border border-[#d5dfda] px-3 py-1.5 text-xs font-semibold text-[#123b35] hover:bg-[#f5f8f6] disabled:opacity-50";
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#123b35]">{t("shop.myOrders")}</h1>
          <p className="mt-1 text-sm text-slate-600">{locale === "so" ? "La soco dalabyada, qiimaynta iyo celinta alaabta." : "Track orders, review purchases, and request item returns."}</p>
        </div>
        <Link href={`/${locale}/customer/payments`} className="font-semibold text-[#8b5e08]">
          {locale === "so" ? "Taariikhda lacag-bixinta" : "Payment history"}
        </Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "so" ? "Raadi lambarka dalabka ama magaca alaabta" : "Search order number or product name"} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 py-2" />
        <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 py-2" aria-label={locale === "so" ? "Shaandhee xaaladda dalabka" : "Filter orders"}>
          {statusOptions.map((option) => <option key={option.value || "all"} value={option.value}>{locale === "so" ? option.somali : option.english}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {loading && orders.length === 0 && <p className="mt-6 text-sm text-slate-600">{t("header.searchLoading")}</p>}
      <div className="mt-6 grid gap-4">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 shadow-sm sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7ece9] pb-4">
              <div>
                <p className="font-mono text-lg font-bold text-[#123b35]">{locale === "so" ? "Dalab" : "Order"} {order.orderNumber}</p>
                <p className="mt-1 text-sm text-slate-600">{new Date(order.createdAt).toLocaleString(locale)} · {order.status.replaceAll("_", " ")}</p>
                <p className="text-xs text-slate-500">{locale === "so" ? "Lacag-bixin" : "Payment"}: {order.paymentStatus.replaceAll("_", " ")}</p>
                {order.simulated && <p className="mt-1 text-xs text-amber-800">{t("shop.simulatedPayment")}</p>}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-lg font-bold">${order.total}</p>
                <Link href={`/${locale}/customer/orders/${order.id}`} className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white">{locale === "so" ? "Eeg dalabka" : "View order"}</Link>
              </div>
            </header>
            <div className="mt-4 grid gap-4">
              {order.vendorOrders.map((vendorOrder) => (
                <section key={vendorOrder.id} className="rounded-xl bg-[#f5f8f6] p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {vendorOrder.logoFileId
                        ? <Image src={`/api/v1/vendors/${vendorOrder.vendorId}/logo`} alt="" width={40} height={40} unoptimized className="size-10 rounded-lg object-cover" />
                        : <span className="grid size-10 place-items-center rounded-lg bg-[#123b35] font-bold text-[#f4b942]">{(vendorOrder.storeName ?? "S").slice(0, 1)}</span>}
                      <div>
                        <p className="font-semibold">{vendorOrder.storeName ?? (locale === "so" ? "Dukaan" : "Store")}</p>
                        <p className="text-xs text-slate-600">{vendorOrder.status.replaceAll("_", " ")} · ${vendorOrder.subtotal}</p>
                      </div>
                    </div>
                    {vendorOrder.trackingNumber && <p className="text-xs text-slate-600">{vendorOrder.courier ?? (locale === "so" ? "Gaarsiin" : "Tracking")}: {vendorOrder.trackingNumber}</p>}
                  </div>
                  {vendorOrder.status === "SHIPPED" && <button type="button" disabled={busy} onClick={() => void confirmDelivery(vendorOrder.id)} className={`${buttonClass} mt-3`}>{locale === "so" ? "Xaqiiji gaarsiinta" : "Confirm delivery"}</button>}
                  <div className="mt-3 grid gap-3">
                    {vendorOrder.lines.map((line) => {
                      const returnedQuantity = line.returns.filter((item) => consumedReturnStatuses.has(item.status)).reduce((sum, item) => sum + item.quantity, 0);
                      const hasOutstandingReturn = line.returns.some((item) => outstandingReturnStatuses.has(item.status));
                      const canReview = vendorOrder.status === "DELIVERED" && order.paymentStatus === "SUCCEEDED" && !line.review && !line.returns.some((item) => item.status === "REFUNDED");
                      const canReturn = vendorOrder.status === "DELIVERED" && isWithinReturnWindow(vendorOrder.deliveredAt) && !hasOutstandingReturn && line.quantity > returnedQuantity;
                      return (
                        <div key={line.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3">
                          {line.imageId
                            ? <Image src={`/api/v1/products/images/${line.imageId}`} alt={localizedName(line)} width={56} height={56} unoptimized className="size-14 rounded-lg bg-[#f5f8f6] object-cover" />
                            : <span className="grid size-14 place-items-center rounded-lg bg-[#f5f8f6] text-[10px] text-slate-500">{locale === "so" ? "Sawir ma jiro" : "No image"}</span>}
                          <div className="min-w-[12rem] flex-1">
                            <Link href={`/${locale}/marketplace/${line.productId}`} className="font-semibold text-[#123b35] hover:underline">{localizedName(line)}</Link>
                            <p className="text-xs text-slate-600">{line.variantName} · {locale === "so" ? "Tiro" : "Qty"} {line.quantity} · ${line.unitPrice} {locale === "so" ? "midkiiba" : "each"}</p>
                          </div>
                          {line.review ? (
                            <Link className={buttonClass} href={`/${locale}/marketplace/${line.productId}#review-${line.review.id}`}>{locale === "so" ? "Eeg qiimaynta" : "View review"}</Link>
                          ) : canReview ? (
                            <button type="button" className={buttonClass} onClick={() => { setReviewTarget({ line, order }); setError(null); }}>{locale === "so" ? "Qiimee" : "Review"}</button>
                          ) : null}
                          {canReturn && <button type="button" className={buttonClass} onClick={() => { setReturnTarget({ line, order, deliveredAt: vendorOrder.deliveredAt }); setReturnQuantity(Math.min(1, line.quantity - returnedQuantity)); setError(null); }}>{locale === "so" ? "Codso celin" : "Request return"}</button>}
                          {line.returns.map((returnRequest) => (
                            <div key={returnRequest.id} className="w-full rounded-lg border border-[#e1e9e5] bg-[#fbfcfb] p-3 text-xs">
                              <p className="font-semibold">{locale === "so" ? "Celinta" : "Return"} · {returnRequest.status.replaceAll("_", " ")} · {returnRequest.quantity} {locale === "so" ? "xabbo" : "item(s)"}</p>
                              {returnRequest.vendorNote && <p className="mt-1 text-slate-600"><span className="font-semibold">{locale === "so" ? "Sababta iibiyaha" : "Vendor's original decision"}:</span> {returnRequest.vendorNote}</p>}
                              {returnRequest.disputeResolution && <p className="mt-1 font-semibold text-[#123b35]">{locale === "so" ? "Natiijada khilaafka" : "Dispute outcome"}: {returnRequest.disputeResolution.replaceAll("_", " ")}</p>}
                              {returnRequest.adminNote && <p className="mt-1 text-slate-700"><span className="font-semibold">{locale === "so" ? "Sharaxaadda maamulka" : "Admin decision explanation"}:</span> {returnRequest.adminNote}{returnRequest.reviewedByAdminAt ? ` · ${new Date(returnRequest.reviewedByAdminAt).toLocaleString(locale)}` : ""}</p>}
                              {returnRequest.returnInstructions && <p className="mt-1 text-slate-700"><span className="font-semibold">{locale === "so" ? "Tilmaamaha celinta" : "Return instructions"}:</span> {returnRequest.returnInstructions}</p>}
                              {returnRequest.disputeUpdates.map((update) => <p key={update.id} className="mt-1 rounded bg-white p-2 text-slate-700"><span className="font-semibold">{update.authorRole} · {update.kind.replaceAll("_", " ")}:</span> {update.content} · {new Date(update.createdAt).toLocaleString(locale)}</p>)}
                              {returnRequest.refund
                                ? <p className="mt-1 text-amber-800">{locale === "so" ? "Xaaladda lacag celinta" : "Refund status"}: {locale === "so" ? "waa la diiwaangeliyey" : "recorded"} · ${returnRequest.refund.amount}. {locale === "so" ? "Lacag dhab ah lama wareejin." : "No real money was transferred."}</p>
                                : ["ADMIN_APPROVED", "RETURN_SHIPPED", "RECEIVED", "REFUND_PROCESSING"].includes(returnRequest.status)
                                  ? <p className="mt-1 text-amber-800">{locale === "so" ? "Xaaladda lacag celinta" : "Refund status"}: {locale === "so" ? "lama bixin" : "not issued"}</p>
                                  : null}
                              {["ESCALATED", "IN_REVIEW"].includes(returnRequest.status) && <div className="mt-2 grid gap-2">
                                <textarea rows={2} maxLength={1000} aria-label={locale === "so" ? "Jawaab khilaaf" : "Dispute reply"} value={disputeMessages[returnRequest.id] ?? ""} onChange={(event) => setDisputeMessages((current) => ({ ...current, [returnRequest.id]: event.target.value }))} className="rounded border p-2" />
                                <button type="button" disabled={busy} onClick={() => void sendDisputeMessage(returnRequest.id)} className="w-fit rounded border px-3 py-1 font-semibold disabled:opacity-50">{locale === "so" ? "Dir xog ama jawaab" : "Send information or reply"}</button>
                              </div>}
                              {returnRequest.photoKey && <a href={`/api/v1/returns/${returnRequest.id}/photo`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[#8b5e08] underline">{locale === "so" ? "Eeg sawirka caddaynta" : "View supporting photo"}</a>}
                              {returnRequest.status === "VENDOR_REJECTED" && <button type="button" disabled={busy} onClick={() => void advanceReturn(returnRequest.id, "ESCALATE")} className="mt-2 font-semibold text-[#8b5e08] disabled:opacity-50">{locale === "so" ? "U gudbi maamulka" : "Escalate to admin"}</button>}
                              {["VENDOR_APPROVED", "ADMIN_APPROVED"].includes(returnRequest.status) && <button type="button" disabled={busy} onClick={() => void advanceReturn(returnRequest.id, "RETURN_SHIPPED")} className="mt-2 font-semibold text-[#8b5e08] disabled:opacity-50">{locale === "so" ? "Calaamadee in la soo diray" : "Mark return shipped"}</button>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {order.receipt && <Link href={`/${locale}/customer/orders/${order.id}/receipt`} className="mt-4 inline-block text-sm font-semibold text-[#8b5e08]">{locale === "so" ? `Rasiidka ${order.receipt.receiptNumber}` : `Payment receipt ${order.receipt.receiptNumber}`}</Link>}
          </article>
        ))}
        {!loading && orders.length === 0 && !error && <p className="rounded-2xl border border-dashed border-[#cfdad4] bg-white p-10 text-center text-sm text-slate-600">{locale === "so" ? "Dalab ma jiro. Marka aad wax iibsato, halkan ayay ka muuqan doonaan." : "No orders found. Your marketplace purchases will appear here."}</p>}
      </div>

      {reviewTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="review-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={submitReview} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="review-title" className="text-xl font-bold text-[#123b35]">{locale === "so" ? "Qiimee alaabta aad iibsatay" : "Review your purchase"}</h2>
            <p className="mt-1 text-sm text-slate-600">{localizedName(reviewTarget.line)} · {reviewTarget.order.orderNumber}</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <label className="mt-4 block text-sm font-semibold">{locale === "so" ? "Qiimaynta xiddigaha" : "Star rating"}
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))} required className="mt-1 min-h-11 w-full rounded-xl border px-3">
                {[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} {locale === "so" ? "xiddig" : item === 1 ? "star" : "stars"}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold">{locale === "so" ? "Faallo (ikhtiyaari)" : "Comment (optional)"}
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={4} className="mt-1 w-full rounded-xl border p-3 font-normal" />
            </label>
            <label className="mt-3 block text-sm font-semibold">{locale === "so" ? "Sawir (ikhtiyaari)" : "Photo (optional)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReviewPhoto(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm font-normal" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setReviewTarget(null)} className={buttonClass}>{locale === "so" ? "Ka noqo" : "Cancel"}</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? (locale === "so" ? "La dirayaa..." : "Submitting...") : (locale === "so" ? "Gudbi qiimaynta" : "Submit review")}</button>
            </div>
          </form>
        </div>
      )}

      {returnTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="return-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={submitReturn} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="return-title" className="text-xl font-bold text-[#123b35]">{locale === "so" ? "Codso celinta alaabta" : "Request a product return"}</h2>
            <p className="mt-1 text-sm text-slate-600">{localizedName(returnTarget.line)} · {returnTarget.order.orderNumber}</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <p className="mt-2 text-xs text-slate-500">{locale === "so" ? `La gaarsiiyey ${returnTarget.deliveredAt ? new Date(returnTarget.deliveredAt).toLocaleString(locale) : ""}` : `Delivered ${returnTarget.deliveredAt ? new Date(returnTarget.deliveredAt).toLocaleString(locale) : ""}`}</p>
            <label className="mt-4 block text-sm font-semibold">{locale === "so" ? "Tirada la celinayo" : "Quantity to return"}
              <input type="number" min={1} max={returnTarget.line.quantity} value={returnQuantity} onChange={(event) => setReturnQuantity(Number(event.target.value))} required className="mt-1 min-h-11 w-full rounded-xl border px-3" />
            </label>
            <label className="mt-3 block text-sm font-semibold">{locale === "so" ? "Sababta celinta" : "Return reason"}
              <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} required className="mt-1 min-h-11 w-full rounded-xl border px-3">
                {returnReasons.map(([value, english, somali]) => <option key={value} value={value}>{locale === "so" ? somali : english}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold">{locale === "so" ? "Faahfaahin (ikhtiyaari)" : "Explanation (optional)"}
              <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border p-3 font-normal" />
            </label>
            <label className="mt-3 block text-sm font-semibold">{locale === "so" ? "Sawir caddayn ah (ikhtiyaari)" : "Supporting photo (optional)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReturnPhoto(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm font-normal" />
            </label>
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{locale === "so" ? "Codsiga waa in lagu gudbiyaa 7 maalmood gudahood laga bilaabo taariikhda dhabta ah ee la gaarsiiyey." : "Submit within seven calendar days of the recorded delivery date. A simulated refund is only recorded after the vendor confirms receipt."}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setReturnTarget(null)} className={buttonClass}>{locale === "so" ? "Ka noqo" : "Cancel"}</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? (locale === "so" ? "La dirayaa..." : "Submitting...") : (locale === "so" ? "Gudbi codsiga celinta" : "Submit return request")}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
