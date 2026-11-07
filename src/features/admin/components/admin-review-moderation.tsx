"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const reviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  photoKey: z.string().nullable(),
  hiddenAt: z.string().nullable(),
  hiddenReason: z.string().nullable(),
  createdAt: z.string(),
  product: z.object({ id: z.string(), name: z.string(), nameSo: z.string().nullable() }),
  customer: z.object({ displayName: z.string().nullable(), email: z.string() }),
});
const responseSchema = z.object({ reviews: z.array(reviewSchema) });
type Review = z.infer<typeof reviewSchema>;

export function AdminReviewModeration({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [product, setProduct] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSomali = locale === "so";

  const loadReviews = useCallback(async () => {
    const query = new URLSearchParams();
    if (product.trim()) query.set("product", product.trim());
    if (rating) query.set("rating", rating);
    if (status) query.set("status", status);
    if (from) query.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) query.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
    try {
      const result = await requestApi(`/api/v1/admin/reviews?${query}`, responseSchema, t("auth.requestFailed"));
      setReviews(result.reviews);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [product, rating, status, from, to, t]);
  useVisiblePolling(loadReviews, 30_000);

  async function moderate(review: Review) {
    const reason = reasons[review.id]?.trim();
    if (!reason) {
      setError(isSomali ? "Sababta dhexdhexaadinta waa waajib." : "A moderation reason is required.");
      return;
    }
    if (!window.confirm(isSomali ? "Ma xaqiijinaysaa isbeddelka?" : "Confirm this moderation action?")) return;
    setBusyId(review.id);
    setError(null);
    try {
      const action = review.hiddenAt ? "restore" : "hide";
      await requestApi(`/api/v1/admin/reviews/${review.id}/${action}`, z.object({ review: z.any() }), t("auth.requestFailed"), postJson({ reason }));
      setReasons((current) => ({ ...current, [review.id]: "" }));
      await loadReviews();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="text-3xl font-bold text-[#123b35]">{isSomali ? "Dhexdhexaadinta qiimaynta" : "Review moderation"}</h2>
      <p className="mt-2 text-sm text-slate-600">{isSomali ? "Qari ama dib u muuji qiimaynta adigoo kaydinaya sababta iyo diiwaanka maamulka." : "Hide or restore customer reviews with a required reason and an auditable admin record."}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={product} onChange={(event) => setProduct(event.target.value)} placeholder={isSomali ? "Magaca alaabta" : "Product name"} className="min-h-10 rounded-xl border px-3" />
        <select value={rating} onChange={(event) => setRating(event.target.value)} className="min-h-10 rounded-xl border px-3" aria-label={isSomali ? "Qiimaynta" : "Rating"}>
          <option value="">{isSomali ? "Dhammaan xiddigaha" : "All ratings"}</option>
          {[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} ★</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-xl border px-3" aria-label={isSomali ? "Xaaladda" : "Review status"}>
          <option value="">{isSomali ? "Dhammaan xaaladaha" : "All statuses"}</option>
          <option value="VISIBLE">{isSomali ? "Muuqda" : "Visible"}</option>
          <option value="HIDDEN">{isSomali ? "Qarsan" : "Hidden"}</option>
        </select>
        <label className="grid gap-1 text-xs text-slate-600">{isSomali ? "Laga bilaabo" : "From"}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-10 rounded-xl border px-3 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs text-slate-600">{isSomali ? "Ilaa" : "To"}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-10 rounded-xl border px-3 text-sm text-slate-900" /></label>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && reviews.length === 0 && <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>}
      <div className="mt-5 grid gap-4">
        {reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-4 shadow-sm">
            <header className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-semibold text-[#123b35]">{isSomali ? review.product.nameSo ?? review.product.name : review.product.name}</p>
                <p className="text-xs text-slate-500">{review.customer.displayName ?? review.customer.email} · {new Date(review.createdAt).toLocaleString(locale)}</p>
              </div>
              <span className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${review.hiddenAt ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{review.hiddenAt ? (isSomali ? "Qarsan" : "Hidden") : (isSomali ? "Muuqda" : "Visible")}</span>
            </header>
            <p className="mt-2 text-amber-700">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
            {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{review.comment}</p>}
            {review.hiddenReason && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">{isSomali ? "Sababtii hore" : "Previous moderation reason"}: {review.hiddenReason}</p>}
            {review.photoKey && <a href={`/api/v1/admin/reviews/${review.id}/photo`} target="_blank" rel="noreferrer" className="mt-3 inline-block"><Image src={`/api/v1/admin/reviews/${review.id}/photo`} alt={isSomali ? "Sawirka qiimaynta" : "Review photo"} width={260} height={180} unoptimized className="max-h-40 w-auto rounded-lg object-cover" /></a>}
            <div className="mt-4 flex flex-wrap gap-2">
              <input value={reasons[review.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} maxLength={500} placeholder={isSomali ? "Sababta waa waajib" : "Required moderation reason"} className="min-h-10 min-w-56 flex-1 rounded-xl border px-3 text-sm" />
              <button type="button" disabled={busyId === review.id} onClick={() => void moderate(review)} className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{review.hiddenAt ? (isSomali ? "Dib u muuji" : "Restore review") : (isSomali ? "Qari qiimaynta" : "Hide review")}</button>
            </div>
          </article>
        ))}
        {!loading && reviews.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{isSomali ? "Qiimayn lama helin shaandhayntan." : "No reviews match these filters."}</p>}
      </div>
    </section>
  );
}
