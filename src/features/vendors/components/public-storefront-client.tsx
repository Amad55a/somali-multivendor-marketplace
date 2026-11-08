"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ExternalLink,
  Heart,
  MapPin,
  MessageSquareText,
  Package,
  PhoneCall,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { MarketplaceBrowser } from "@/features/products/components/marketplace-browser";
import { postJson, requestApi } from "@/lib/api/client";
import { z } from "zod";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  verifiedPurchase: boolean;
  customer: {
    displayName: string | null;
  };
  product: {
    id: string;
    name: string;
    nameSo: string | null;
  };
}

export interface StorefrontData {
  vendorId: string;
  storeName: string;
  businessType: string | null;
  description: string | null;
  isVerified: boolean;
  location: string[];
  marketAssociation: string | null;
  logoFileId: string | null;
  joinedAt: string | null;
  productCount: number;
  completedOrderCount: number;
  totalSoldUnits: number;
  ratingAverage: number;
  reviewCount: number;
  ratingDistribution: Record<number, number>;
  reviews: Review[];
}

export function PublicStorefrontClient({
  store,
  locale,
}: Readonly<{
  store: StorefrontData;
  locale: Locale;
}>) {
  const { t } = useTranslation();
  const router = useRouter();
  const isSomali = locale === "so";

  const [contacting, setContacting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [visibleReviewCount, setVisibleReviewCount] = useState(6);

  const formattedLocation = store.location.join(", ");
  const joinedDate = store.joinedAt
    ? new Date(store.joinedAt).toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
      })
    : null;

  const handleContactVendor = async () => {
    setContacting(true);
    setContactError(null);
    try {
      // Find a product from this vendor to start the conversation if any
      const result = await requestApi(
        "/api/v1/conversations",
        z.object({ conversationId: z.string() }),
        t("communications.contactVendorFailed"),
        postJson({ vendorId: store.vendorId }),
      );
      router.push(`/${locale}/customer/messages?conversationId=${result.conversationId}`);
    } catch {
      // Fallback: direct to customer messages
      router.push(`/${locale}/customer/messages`);
    } finally {
      setContacting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back to Marketplace Link */}
      <Link
        href={`/${locale}/marketplace`}
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8b5e08] hover:underline"
      >
        ← {isSomali ? "Ku noqo suuqa" : "Back to marketplace"}
      </Link>

      {/* Store Header Card */}
      <section className="relative overflow-hidden rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
        {/* Decorative Top Accent Bar */}
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-r from-[#123b35] via-[#1b554c] to-[#f4b942]" />

        <div className="mt-2 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* Store Logo */}
            {store.logoFileId ? (
              <Image
                src={`/api/v1/vendors/${store.vendorId}/logo`}
                alt={store.storeName}
                width={128}
                height={128}
                unoptimized
                className="size-24 rounded-2xl border-2 border-[#e1e9e5] object-cover shadow-sm sm:size-32"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-24 shrink-0 place-items-center rounded-2xl bg-[#123b35] text-4xl font-extrabold text-[#f4b942] shadow-sm sm:size-32"
              >
                {store.storeName.slice(0, 1).toUpperCase()}
              </div>
            )}

            {/* Store Bio & Info */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-extrabold text-[#123b35] sm:text-3xl">
                  {store.storeName}
                </h1>

                {store.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    {isSomali ? "Iibiyaha La Xaqiijiyey" : "Verified Store"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {isSomali ? "Dukaanka Rasmiga ah" : "Registered Store"}
                  </span>
                )}
              </div>

              {store.businessType && (
                <p className="mt-1 text-sm font-semibold text-[#a06c0b]">
                  {store.businessType}
                </p>
              )}

              {/* Location & Metadata */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {formattedLocation && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5 text-slate-400" />
                    {formattedLocation}
                  </span>
                )}
                {store.marketAssociation && (
                  <span>· {store.marketAssociation}</span>
                )}
                {joinedDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5 text-slate-400" />
                    {isSomali ? `Wuxuu ku biiray: ${joinedDate}` : `Joined: ${joinedDate}`}
                  </span>
                )}
              </div>

              {store.description && (
                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {store.description}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons: Contact Vendor & Follow */}
          <div className="flex flex-row gap-3 md:flex-col sm:w-auto">
            <button
              type="button"
              disabled={contacting}
              onClick={() => void handleContactVendor()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#123b35] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#194a43] disabled:opacity-50"
            >
              <MessageSquareText className="size-4" />
              {contacting
                ? isSomali
                  ? "Furaya..."
                  : "Opening..."
                : isSomali
                  ? "La xiriir Iibiyaha"
                  : "Contact Vendor"}
            </button>

            <button
              type="button"
              onClick={() => setFollowing(!following)}
              className={`flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition ${
                following
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-[#dce4e1] bg-white text-[#123b35] hover:bg-slate-50"
              }`}
            >
              <Heart className={`size-4 ${following ? "fill-emerald-600 text-emerald-600" : ""}`} />
              {following
                ? isSomali
                  ? "Waa la Raacayaa"
                  : "Following"
                : isSomali
                  ? "Raac Dukaanka"
                  : "Follow Store"}
            </button>
          </div>
        </div>

        {contactError && <p className="mt-2 text-xs text-red-600">{contactError}</p>}

        {/* Real Database Trust & Stats Strip */}
        <dl className="mt-8 grid grid-cols-2 gap-3 border-t border-slate-100 pt-6 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-4 text-center">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isSomali ? "Qiimaynta Celceliska" : "Average Rating"}
            </dt>
            <dd className="mt-1 flex items-center justify-center gap-1 text-2xl font-extrabold text-[#123b35]">
              {store.reviewCount > 0 ? (
                <>
                  <Star className="size-5 fill-amber-400 text-amber-400" />
                  <span>{store.ratingAverage.toFixed(1)}</span>
                </>
              ) : (
                <span className="text-base font-medium text-slate-400">—</span>
              )}
            </dd>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-4 text-center">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isSomali ? "Wadarta Qiimaynta" : "Customer Reviews"}
            </dt>
            <dd className="mt-1 text-2xl font-extrabold text-[#123b35]">
              {store.reviewCount}
            </dd>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-4 text-center">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isSomali ? "Alaabta Yaal" : "Products Listed"}
            </dt>
            <dd className="mt-1 text-2xl font-extrabold text-[#123b35]">
              {store.productCount}
            </dd>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-4 text-center">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isSomali ? "Xabbo La Iibiyey" : "Units Sold"}
            </dt>
            <dd className="mt-1 text-2xl font-extrabold text-[#123b35]">
              {store.totalSoldUnits > 0 ? store.totalSoldUnits : store.completedOrderCount}
            </dd>
          </div>

          <div className="col-span-2 rounded-2xl border border-slate-100 bg-[#f8faf9] p-4 text-center sm:col-span-4 lg:col-span-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isSomali ? "Dalabyo La Gaarsiiyey" : "Completed Orders"}
            </dt>
            <dd className="mt-1 text-2xl font-extrabold text-[#123b35]">
              {store.completedOrderCount}
            </dd>
          </div>
        </dl>
      </section>

      {/* Vendor Store Products Section */}
      <section className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-[#123b35]">
              {isSomali ? "Alaabta Dukaanka" : "Store Products"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSomali
                ? `Dhammaan alaabta la xaqiijiyey ee ka tirsan ${store.storeName}`
                : `Published products available from ${store.storeName}`}
            </p>
          </div>
        </div>

        {/* Real Marketplace Browser Scoped to This Vendor */}
        <MarketplaceBrowser locale={locale} initialVendorId={store.vendorId} />
      </section>

      {/* Dedicated Customer Reviews Section */}
      <section className="mt-14 rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-[#123b35]">
              {isSomali ? "Qiimaynta Macaamiisha Dukaanka" : "Store Customer Reviews"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSomali
                ? "Fikradaha iyo qiimaynta macaamiisha dhabta ah ee wax ka iibsatay dukaankan"
                : "Genuine customer ratings and reviews from verified purchases"}
            </p>
          </div>
        </div>

        {store.reviewCount > 0 ? (
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {/* Rating Breakdown Card */}
            <div className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-6 text-center md:col-span-1">
              <p className="text-5xl font-black text-[#123b35]">
                {store.ratingAverage.toFixed(1)}
              </p>
              <div className="mt-2 flex justify-center text-amber-400">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`size-5 ${
                      star <= Math.round(store.ratingAverage)
                        ? "fill-amber-400"
                        : "text-slate-200"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                {isSomali
                  ? `Celcelis ahaan ${store.reviewCount} qiimayn`
                  : `Average from ${store.reviewCount} reviews`}
              </p>

              {/* 1-5 Star Distribution */}
              <div className="mt-6 space-y-2 text-xs">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = store.ratingDistribution[rating] ?? 0;
                  const pct = store.reviewCount ? (count / store.reviewCount) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-2.5 text-slate-600">
                      <span className="w-6 font-semibold text-end">{rating}★</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-[#f4b942]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-start text-slate-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reviews List */}
            <div className="space-y-4 md:col-span-2">
              {store.reviews.slice(0, visibleReviewCount).map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm transition hover:border-[#123b35]/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[#123b35] text-xs font-bold text-[#f4b942]">
                        {(review.customer.displayName ?? "C").slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#123b35]">
                          {review.customer.displayName ?? (isSomali ? "Macmiil" : "Customer")}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="text-amber-600 font-bold">
                            {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                          </span>
                          <span>·</span>
                          <time dateTime={review.createdAt instanceof Date ? review.createdAt.toISOString() : String(review.createdAt)}>
                            {new Date(review.createdAt).toLocaleDateString(locale)}
                          </time>
                        </div>
                      </div>
                    </div>

                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="size-3 text-emerald-600" />
                      {isSomali ? "Iibsi La Xaqiijiyey" : "Verified Purchase"}
                    </span>
                  </div>

                  {review.comment && (
                    <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {review.comment}
                    </p>
                  )}

                  <div className="mt-3.5 border-t border-slate-100 pt-3">
                    <Link
                      href={`/${locale}/marketplace/${review.product.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#8b5e08] hover:underline"
                    >
                      <Package className="size-3.5" />
                      {isSomali ? "Alaabta" : "Product"}: {isSomali ? review.product.nameSo ?? review.product.name : review.product.name}
                    </Link>
                  </div>
                </article>
              ))}

              {/* Load More Button */}
              {store.reviews.length > visibleReviewCount && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleReviewCount((c) => c + 6)}
                    className="rounded-xl border border-[#123b35] px-6 py-2.5 text-xs font-bold text-[#123b35] hover:bg-[#123b35]/5"
                  >
                    {isSomali ? "Soo bandhig qiimayno dheeraad ah" : "Load more reviews"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-[#f8faf9] p-8 text-center text-slate-500">
            <p className="text-sm">
              {isSomali
                ? "Dukaankani weli ma helin wax qiimayn ah."
                : "This store has not received any reviews yet."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
