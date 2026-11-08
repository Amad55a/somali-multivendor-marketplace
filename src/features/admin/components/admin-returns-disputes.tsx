"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";
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
    audience: z.string(),
    kind: z.string(),
    content: z.string(),
    requestedFrom: z.string().nullable(),
    createdAt: z.string(),
  })),
  createdAt: z.string(),
  order: z.object({ id: z.string(), orderNumber: z.string() }),
  customer: z.object({ displayName: z.string().nullable(), email: z.string() }),
  vendor: z.object({ id: z.string(), vendorProfile: z.object({ storeName: z.string().nullable() }).nullable() }),
  orderLine: z.object({
    productName: z.string(),
    productNameSo: z.string().nullable(),
    variantName: z.string(),
    unitPrice: z.union([z.string(), z.number()]),
    quantity: z.number(),
    vendorOrder: z.object({
      ledgerEntries: z.array(z.object({
        id: z.string(),
        type: z.string(),
        amount: z.union([z.string(), z.number()]),
        idempotencyKey: z.string(),
        createdAt: z.string(),
      })),
    }),
  }),
  refund: z.object({ id: z.string(), amount: z.union([z.string(), z.number()]), simulated: z.boolean(), createdAt: z.string() }).nullable(),
});
const responseSchema = z.object({ returns: z.array(returnSchema) });
type ReturnRequest = z.infer<typeof returnSchema>;
const statusOptions = ["REQUESTED", "VENDOR_APPROVED", "VENDOR_REJECTED", "RETURN_SHIPPED", "ESCALATED", "IN_REVIEW", "ADMIN_APPROVED", "ADMIN_REJECTED", "RECEIVED", "REFUNDED"];
const adminActionSchema = z.object({
  returnRequest: z.object({ status: z.string(), reviewedByAdminAt: z.string().nullable() }),
});

export function AdminReturnsDisputes({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [status, setStatus] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, "CUSTOMER" | "VENDOR" | "BOTH">>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isSomali = locale === "so";

  const loadReturns = useCallback(async () => {
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const result = await requestApi(`/api/v1/admin/returns${query}`, responseSchema, t("auth.requestFailed"));
      setReturns(result.returns);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, t]);
  useVisiblePolling(loadReturns, 30_000);

  async function decide(request: ReturnRequest, action: "ADMIN_START_REVIEW" | "ADMIN_UPHOLD" | "ADMIN_OVERTURN" | "ADMIN_REQUEST_INFO" | "ADMIN_MESSAGE") {
    const reason = reasons[request.id]?.trim();
    const target = targets[request.id] ?? "BOTH";
    if (!reason) {
      setError(isSomali ? "Sababta go'aanka waa waajib." : "A decision reason is required.");
      return;
    }
    if (action === "ADMIN_OVERTURN" && !instructions[request.id]?.trim()) {
      setError(isSomali ? "Tilmaamaha celinta waa waajib marka la oggolaado." : "Return instructions are required to authorize the return.");
      return;
    }
    const finalDecision = action === "ADMIN_UPHOLD" || action === "ADMIN_OVERTURN";
    if (!window.confirm(finalDecision
      ? (isSomali ? "Ma xaqiijinaysaa go'aanka kama dambaysta ah?" : "Confirm this final dispute decision?")
      : (isSomali ? "Ma xaqiijinaysaa tallaabadan?" : "Confirm this dispute action?"))) return;
    setBusyId(request.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await requestApi(`/api/v1/returns/${request.id}/action`, adminActionSchema, t("auth.requestFailed"), postJson({
        action,
        note: reason,
        ...(action === "ADMIN_OVERTURN" ? { instructions: instructions[request.id].trim() } : {}),
        ...(["ADMIN_REQUEST_INFO", "ADMIN_MESSAGE"].includes(action) ? { target } : {}),
      }));
      const expectedStatus = action === "ADMIN_START_REVIEW" || action === "ADMIN_REQUEST_INFO"
        ? "IN_REVIEW"
        : action === "ADMIN_UPHOLD"
          ? "ADMIN_REJECTED"
          : action === "ADMIN_OVERTURN"
            ? "ADMIN_APPROVED"
            : request.status;
      if (result.returnRequest.status !== expectedStatus) {
        throw new Error(isSomali ? "Xogta la keydiyey ma waafaqsana tallaabada la doortay." : "The saved dispute state did not match the selected action.");
      }
      setSuccess(`${isSomali ? "Waa la keydiyey" : "Saved"}: ${result.returnRequest.status.replaceAll("_", " ")}${result.returnRequest.reviewedByAdminAt ? ` · ${new Date(result.returnRequest.reviewedByAdminAt).toLocaleString(locale)}` : ""}`);
      await loadReturns();
      window.dispatchEvent(new Event("admin-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="text-3xl font-bold text-[#123b35]">{isSomali ? "Celinnada iyo khilaafaadka" : "Returns & disputes"}</h2>
      <p className="mt-2 text-sm text-slate-600">{isSomali ? "Dib u eeg caddaynta, go'aannada iibiyaha, diiwaanka lacag-celinta iyo xisaabaadka iibiyaha." : "Review customer and vendor evidence, decisions, simulated refunds, and vendor ledger entries."}</p>
      <label className="mt-5 block max-w-sm text-sm font-semibold">{isSomali ? "Shaandhee xaaladda" : "Filter by status"}
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-white px-3">
          <option value="">{isSomali ? "Dhammaan codsiyada" : "All return requests"}</option>
          {statusOptions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
      {loading && returns.length === 0 && <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>}
      <div className="mt-5 grid gap-4">
        {returns.map((request) => (
          <article key={request.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 shadow-sm sm:p-5">
            <header className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-mono font-bold text-[#123b35]">RET-{request.id.slice(0, 8).toUpperCase()} · {request.order.orderNumber}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(request.createdAt).toLocaleString(locale)} · {request.status.replaceAll("_", " ")}</p>
              </div>
              <span className="h-fit rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-bold">{request.status === "ESCALATED" ? (isSomali ? "Khilaaf" : "Dispute") : request.status.replaceAll("_", " ")}</span>
            </header>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-3 text-sm">
                <p><span className="font-semibold">{isSomali ? "Macmiil" : "Customer"}:</span> {request.customer.displayName ?? request.customer.email} · {request.customer.email}</p>
                <p><span className="font-semibold">{isSomali ? "Iibiye" : "Vendor"}:</span> {request.vendor.vendorProfile?.storeName ?? request.vendor.id}</p>
                <p><span className="font-semibold">{isSomali ? "Alaab" : "Product"}:</span> {isSomali ? request.orderLine.productNameSo ?? request.orderLine.productName : request.orderLine.productName} · {request.orderLine.variantName}</p>
                <p><span className="font-semibold">{isSomali ? "Tirada" : "Quantity"}:</span> {request.quantity}/{request.orderLine.quantity} · ${request.orderLine.unitPrice}</p>
                <p><span className="font-semibold">{isSomali ? "Sababta macmiilka" : "Customer reason"}:</span> {request.reason.replaceAll("_", " ")}</p>
                {request.explanation && <p><span className="font-semibold">{isSomali ? "Faahfaahinta macmiilka" : "Customer explanation"}:</span> {request.explanation}</p>}
                {request.vendorNote && <p><span className="font-semibold">{isSomali ? "Go'aanka iibiyaha" : "Vendor decision"}:</span> {request.vendorNote}</p>}
                {request.returnInstructions && <p><span className="font-semibold">{isSomali ? "Tilmaamaha celinta" : "Return instructions"}:</span> {request.returnInstructions}</p>}
                {request.adminNote && <p><span className="font-semibold">{isSomali ? "Sababta maamulka" : "Admin decision reason"}:</span> {request.adminNote}</p>}
                {request.disputeResolution && <p><span className="font-semibold">{isSomali ? "Natiijada khilaafka" : "Dispute outcome"}:</span> {request.disputeResolution.replaceAll("_", " ")}</p>}
                {request.reviewedByAdminAt && <p><span className="font-semibold">{isSomali ? "Go'aanka la keydiyey" : "Decision saved"}:</span> {new Date(request.reviewedByAdminAt).toLocaleString(locale)}</p>}
                {request.disputeUpdates.map((update) => (
                  <p key={update.id} className="rounded-lg bg-slate-50 p-2"><span className="font-semibold">{update.authorRole} · {update.kind.replaceAll("_", " ")} · {update.audience}:</span> {update.content} <span className="text-xs text-slate-500">{new Date(update.createdAt).toLocaleString(locale)}</span></p>
                ))}
              </div>
              {request.photoKey && <a href={`/api/v1/returns/${request.id}/photo`} target="_blank" rel="noreferrer" className="block h-fit"><Image src={`/api/v1/returns/${request.id}/photo`} alt={isSomali ? "Sawirka caddaynta" : "Return evidence"} width={280} height={200} unoptimized className="max-h-48 w-full rounded-xl object-cover lg:w-64" /></a>}
            </div>
            {request.refund && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">{isSomali ? "Rasiidka soo celinta tijaabada ah" : "Simulated refund receipt"}</p><p>${request.refund.amount} · {new Date(request.refund.createdAt).toLocaleString(locale)} · {isSomali ? "lacag dhab ah lama wareejin" : "no real money transferred"}</p></div>}
            {request.orderLine.vendorOrder.ledgerEntries.length > 0 && (
              <details className="mt-4 rounded-xl border border-[#e1e9e5] p-3">
                <summary className="cursor-pointer text-sm font-semibold">{isSomali ? "Taariikhda ledger-ka iibiyaha" : "Vendor ledger history"}</summary>
                <ul className="mt-3 grid gap-2 text-xs">
                  {request.orderLine.vendorOrder.ledgerEntries.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2"><span>{entry.type} · {entry.idempotencyKey}</span><span>${entry.amount} · {new Date(entry.createdAt).toLocaleString(locale)}</span></li>)}
                </ul>
              </details>
            )}
            {["ESCALATED", "IN_REVIEW"].includes(request.status) && (
              <div className="mt-4 grid gap-3 border-t border-[#e7ece9] pt-4">
                <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Sababta ama farriinta" : "Decision explanation or message"}
                  <textarea rows={2} maxLength={1000} value={reasons[request.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} className="rounded-xl border p-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Cidda lala xiriirayo" : "Party to contact"}
                  <select value={targets[request.id] ?? "BOTH"} onChange={(event) => setTargets((current) => ({ ...current, [request.id]: event.target.value as "CUSTOMER" | "VENDOR" | "BOTH" }))} className="min-h-10 rounded-xl border px-3 font-normal">
                    <option value="BOTH">{isSomali ? "Labada dhinac" : "Both parties"}</option>
                    <option value="CUSTOMER">{isSomali ? "Macmiilka" : "Customer"}</option>
                    <option value="VENDOR">{isSomali ? "Iibiyaha" : "Vendor"}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Tilmaamaha celinta (waajib marka la beddelayo diidmada)" : "Return instructions (required to overturn)"}
                  <textarea rows={2} maxLength={1000} value={instructions[request.id] ?? ""} onChange={(event) => setInstructions((current) => ({ ...current, [request.id]: event.target.value }))} className="rounded-xl border p-3 font-normal" />
                </label>
                <div className="flex flex-wrap gap-2">
                  {request.status === "ESCALATED" && <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "ADMIN_START_REVIEW")} className="rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === request.id ? t("vendor.submitting") : isSomali ? "Qaado dib-u-eegis" : "Take under review"}</button>}
                  <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "ADMIN_OVERTURN")} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSomali ? "Beddel diidmada oo oggolow celinta" : "Overturn & authorize return"}</button>
                  <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "ADMIN_UPHOLD")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{isSomali ? "Xaqiiji diidmada iibiyaha" : "Uphold vendor decision"}</button>
                  <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "ADMIN_REQUEST_INFO")} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{isSomali ? "Codso xog dheeraad ah" : "Request more information"}</button>
                  <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "ADMIN_MESSAGE")} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{isSomali ? "U dir farriin" : "Send message"}</button>
                </div>
              </div>
            )}
          </article>
        ))}
        {!loading && returns.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{isSomali ? "Codsi celin lama helin." : "No return requests match this filter."}</p>}
      </div>
    </section>
  );
}
