"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { z } from "zod";
import { useLocaleContext } from "@/i18n/locale-provider";
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
    kind: z.string(),
    content: z.string(),
    requestedFrom: z.string().nullable(),
    createdAt: z.string(),
  })),
  returnShipmentNote: z.string().nullable(),
  createdAt: z.string(),
  order: z.object({ orderNumber: z.string(), contactName: z.string(), phone: z.string(), city: z.string() }),
  orderLine: z.object({ productName: z.string(), productNameSo: z.string().nullable(), variantName: z.string(), unitPrice: z.union([z.string(), z.number()]), quantity: z.number() }),
  refund: z.object({ amount: z.union([z.string(), z.number()]), simulated: z.boolean() }).nullable(),
});
const responseSchema = z.object({ returns: z.array(returnSchema) });
type ReturnRequest = z.infer<typeof returnSchema>;

export function VendorReturnsBoard() {
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [disputeMessages, setDisputeMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSomali = locale === "so";

  const loadReturns = useCallback(async () => {
    try {
      const result = await requestApi("/api/v1/vendor/returns", responseSchema, t("auth.requestFailed"));
      setReturns(result.returns);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useVisiblePolling(loadReturns, 30_000);

  async function act(request: ReturnRequest, action: "APPROVE" | "REJECT" | "RECEIVE") {
    const note = notes[request.id]?.trim();
    if (action === "REJECT" && !note) {
      setError(isSomali ? "Sharaxaad ayaa loo baahan yahay si loo diido celinta." : "An explanation is required to reject a return.");
      return;
    }

    if (!window.confirm(isSomali ? "Ma xaqiijinaysaa tallaabadan?" : "Confirm this return decision?")) return;
    setBusyId(request.id);
    setError(null);
    try {
      await requestApi(`/api/v1/returns/${request.id}/action`, z.object({ returnRequest: z.any() }), t("auth.requestFailed"), postJson({
        action,
        ...(note ? { note } : {}),
        ...(instructions[request.id]?.trim() ? { instructions: instructions[request.id].trim() } : {}),
      }));
      await loadReturns();
      window.dispatchEvent(new Event("vendor-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function sendDisputeMessage(request: ReturnRequest) {
    const note = disputeMessages[request.id]?.trim();
    if (!note) {
      setError(isSomali ? "Farriin geli ka hor dirista." : "Enter a message before sending.");
      return;
    }
    setBusyId(request.id);
    setError(null);
    try {
      await requestApi(`/api/v1/returns/${request.id}/action`, z.object({ returnRequest: z.any() }), t("auth.requestFailed"), postJson({
        action: "DISPUTE_MESSAGE",
        note,
      }));
      setDisputeMessages((current) => ({ ...current, [request.id]: "" }));
      await loadReturns();
      window.dispatchEvent(new Event("vendor-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="text-3xl font-bold">{isSomali ? "Codsiyada celinta" : "Return requests"}</h2>
      <p className="mt-2 text-sm text-slate-600">{isSomali ? "Waxaad arki kartaa oo keliya codsiyada dalabyada dukaankaaga." : "Only return requests for your vendor orders are shown here."}</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && returns.length === 0 && <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>}
      <div className="mt-6 grid gap-4">
        {returns.map((request) => (
          <article key={request.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 shadow-sm sm:p-5">
            <header className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-mono font-bold text-[#123b35]">RET-{request.id.slice(0, 8).toUpperCase()} · {request.order.orderNumber}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(request.createdAt).toLocaleString(locale)}</p>
              </div>
              <span className="h-fit rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-bold">{request.status.replaceAll("_", " ")}</span>
            </header>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold">{isSomali ? request.orderLine.productNameSo ?? request.orderLine.productName : request.orderLine.productName}</p>
                <p className="text-sm text-slate-600">{request.orderLine.variantName} · ${request.orderLine.unitPrice} · {isSomali ? "Tirada la codsaday" : "Requested quantity"}: {request.quantity}/{request.orderLine.quantity}</p>
                <p className="mt-2 text-sm"><span className="font-semibold">{isSomali ? "Sabab" : "Reason"}:</span> {request.reason.replaceAll("_", " ")}</p>
                {request.explanation && <p className="mt-1 text-sm text-slate-600">{request.explanation}</p>}
                <p className="mt-3 text-sm text-slate-600">{request.order.contactName} · {request.order.phone} · {request.order.city}</p>
                {request.returnShipmentNote && <p className="mt-1 text-xs text-slate-600">{isSomali ? "Faahfaahinta dirista" : "Shipment note"}: {request.returnShipmentNote}</p>}
                {request.vendorNote && <p className="mt-1 text-xs text-slate-600">{isSomali ? "Go'aankaaga" : "Your decision"}: {request.vendorNote}</p>}
                {request.returnInstructions && <p className="mt-1 text-xs text-slate-600">{isSomali ? "Tilmaamaha" : "Return instructions"}: {request.returnInstructions}</p>}
                {request.disputeResolution && <p className="mt-1 text-sm font-semibold text-[#123b35]">{isSomali ? "Natiijada khilaafka" : "Dispute outcome"}: {request.disputeResolution.replaceAll("_", " ")}</p>}
                {request.adminNote && <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">{isSomali ? "Sharaxaadda maamulka" : "Admin decision explanation"}:</span> {request.adminNote}{request.reviewedByAdminAt ? ` · ${new Date(request.reviewedByAdminAt).toLocaleString(locale)}` : ""}</p>}
                {request.disputeUpdates.map((update) => <p key={update.id} className="mt-1 rounded bg-slate-50 p-2 text-sm"><span className="font-semibold">{update.authorRole} · {update.kind.replaceAll("_", " ")}:</span> {update.content} · {new Date(update.createdAt).toLocaleString(locale)}</p>)}
              </div>
              {request.photoKey && <a href={`/api/v1/returns/${request.id}/photo`} target="_blank" rel="noreferrer" className="block h-fit"><Image src={`/api/v1/returns/${request.id}/photo`} alt={isSomali ? "Sawirka caddaynta celinta" : "Return evidence"} width={260} height={180} unoptimized className="max-h-44 w-full rounded-xl object-cover md:w-64" /></a>}
            </div>
            {request.refund && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{isSomali ? "Soo celin tijaabo ah" : "Simulated refund"}: ${request.refund.amount}; {isSomali ? "lacag dhab ah lama wareejin." : "no real money was transferred."}</p>}
            {["ESCALATED", "IN_REVIEW"].includes(request.status) && <div className="mt-4 grid gap-2 border-t pt-4">
              <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Jawaab ama caddayn maamulka iyo macmiilka" : "Reply or evidence for the customer and administrator"}
                <textarea rows={2} maxLength={1000} value={disputeMessages[request.id] ?? ""} onChange={(event) => setDisputeMessages((current) => ({ ...current, [request.id]: event.target.value }))} className="rounded-xl border p-3 font-normal" />
              </label>
              <button type="button" disabled={busyId === request.id} onClick={() => void sendDisputeMessage(request)} className="w-fit rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busyId === request.id ? t("vendor.submitting") : isSomali ? "Dir jawaab" : "Send reply"}</button>
            </div>}
            {request.status === "REQUESTED" && (
              <div className="mt-4 grid gap-3 border-t border-[#e7ece9] pt-4">
                <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Tilmaamaha celinta (ikhtiyaari)" : "Return instructions (optional)"}
                  <textarea rows={2} maxLength={1000} value={instructions[request.id] ?? ""} onChange={(event) => setInstructions((current) => ({ ...current, [request.id]: event.target.value }))} className="rounded-xl border p-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">{isSomali ? "Sababta go'aanka (waa waajib marka la diidayo)" : "Decision explanation (required for rejection)"}
                  <textarea rows={2} maxLength={1000} value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} className="rounded-xl border p-3 font-normal" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === request.id} onClick={() => void act(request, "APPROVE")} className="rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSomali ? "Oggolow celinta" : "Approve return"}</button>
                  <button type="button" disabled={busyId === request.id} onClick={() => void act(request, "REJECT")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{isSomali ? "Diid" : "Reject"}</button>
                </div>
              </div>
            )}
            {request.status === "RETURN_SHIPPED" && <button type="button" disabled={busyId === request.id} onClick={() => void act(request, "RECEIVE")} className="mt-4 rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSomali ? "Xaqiiji helitaanka oo diiwaangeli soo celin tijaabo ah" : "Confirm receipt and record simulated refund"}</button>}
          </article>
        ))}
        {!loading && returns.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{isSomali ? "Weli ma jiraan codsiyo celin." : "No return requests yet."}</p>}
      </div>
    </section>
  );
}
