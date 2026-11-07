"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { addCartItem } from "@/features/commerce/cart-api";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const productSchema = z.object({
  id: z.string(),
  ratingAverage: z.number(),
  reviewCount: z.number(),
  ratingDistribution: z.record(z.string(), z.number()),
  purchaseCount: z.number(),
  name: z.string(),
  nameSo: z.string().nullable(),
  description: z.string().nullable(),
  descriptionSo: z.string().nullable(),
  brand: z.string().nullable().optional(),
  category: z.object({ name: z.string(), nameSo: z.string().nullable() }),
  vendor: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    vendorProfile: z.object({
      storeName: z.string().nullable(),
      country: z.string().nullable(),
      region: z.string().nullable(),
      city: z.string().nullable(),
      files: z.array(z.object({ id: z.string() })),
    }).nullable(),
  }),
  variants: z.array(z.object({ id: z.string(), sku: z.string(), variantName: z.string(), attributes: z.record(z.string(), z.string()).nullable().optional(), price: z.union([z.string(), z.number()]), stockQuantity: z.number(), isActive: z.boolean() })),
  images: z.array(z.object({ id: z.string(), isPrimary: z.boolean() })),
  reviews: z.array(z.object({
    id: z.string(),
    rating: z.number(),
    comment: z.string().nullable(),
    photoKey: z.string().nullable(),
    verifiedPurchase: z.boolean(),
    createdAt: z.string(),
    customer: z.object({ displayName: z.string().nullable() }),
  })).optional(),
});

export default function ProductDetailClient({ productId, locale }: Readonly<{ productId: string; locale: "en" | "so" }>) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<z.infer<typeof productSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const loadProduct = useCallback(async () => {
    try {
      const result = await requestApi(`/api/v1/products/${productId}`, z.object({ product: productSchema }), t("auth.requestFailed"));
      setProduct(result.product);
      setSelectedImageId((current) => current ?? result.product.images[0]?.id ?? null);
      setSelected((current) => result.product.variants.some((variant) => variant.id === current && variant.isActive && variant.stockQuantity > 0)
        ? current
        : result.product.variants.find((variant) => variant.isActive && variant.stockQuantity > 0)?.id ?? result.product.variants[0]?.id ?? null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [productId, t]);
  useVisiblePolling(loadProduct, 30_000);
  const images = useMemo(() => product?.images ?? [], [product?.images]);
  const selectedIndex = Math.max(0, images.findIndex((image) => image.id === selectedImageId));
  const selectedImage = images[selectedIndex];
  useEffect(() => {
    if (!viewerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
      if (event.key === "ArrowRight" && images.length > 1) setSelectedImageId(images[(selectedIndex + 1) % images.length]?.id ?? null);
      if (event.key === "ArrowLeft" && images.length > 1) setSelectedImageId(images[(selectedIndex - 1 + images.length) % images.length]?.id ?? null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images, selectedIndex, viewerOpen]);
  function markImageBroken(imageId: string) {
    setBrokenImages((current) => new Set(current).add(imageId));
  }
  function moveImage(direction: -1 | 1) {
    if (!images.length) return;
    setSelectedImageId(images[(selectedIndex + direction + images.length) % images.length]?.id ?? null);
  }
  if (error) return <p className="mx-auto max-w-3xl px-4 py-12 text-red-700">{error}</p>;
  if (!product) return <p className="mx-auto max-w-3xl px-4 py-12 text-slate-600">{t("header.searchLoading")}</p>;
  const variant = product.variants.find((item) => item.id === selected);
  const soldOut = !variant || variant.stockQuantity < 1;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= (variant?.stockQuantity ?? 0);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <Link href={`/${locale}/marketplace`} className="text-sm font-semibold text-[#8b5e08] hover:underline">{t("shop.continueShopping")}</Link>
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <div className="grid content-start gap-3">
          {selectedImage && !brokenImages.has(selectedImage.id) ? (
            <button type="button" onClick={() => setViewerOpen(true)} aria-label="Open product image viewer" className="block w-full overflow-hidden rounded-2xl bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-[#123b35]">
              <Image src={`/api/v1/products/images/${selectedImage.id}`} alt={product.name} width={900} height={900} unoptimized onError={() => markImageBroken(selectedImage.id)} className="aspect-square w-full object-contain" />
            </button>
          ) : <div className="grid aspect-square place-items-center rounded-2xl bg-[#f5f8f6] text-slate-500">{t("vendor.noImage")}</div>}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {images.map((image, index) => (
                <button key={image.id} type="button" onClick={() => setSelectedImageId(image.id)} aria-label={`View product image ${index + 1}`} aria-pressed={selectedImageId === image.id} className={`overflow-hidden rounded-lg border-2 ${selectedImageId === image.id ? "border-[#123b35]" : "border-transparent"}`}>
                  {brokenImages.has(image.id)
                    ? <span className="grid aspect-square place-items-center bg-[#f5f8f6] text-xs text-slate-500">Unavailable</span>
                    : <Image src={`/api/v1/products/images/${image.id}`} alt="" width={120} height={120} unoptimized onError={() => markImageBroken(image.id)} className="aspect-square w-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">{locale === "so" ? product.category.nameSo ?? product.category.name : product.category.name}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#123b35]">{locale === "so" ? product.nameSo ?? product.name : product.name}</h1>
          <p className="mt-3 text-sm text-slate-600">{t("shop.vendor")}: {product.vendor.vendorProfile?.storeName ?? product.vendor.displayName}</p>
          {product.brand && <p className="mt-1 text-sm text-slate-600">{product.brand}</p>}
          {(locale === "so" ? product.descriptionSo ?? product.description : product.description) && <p className="mt-6 whitespace-pre-wrap text-slate-700">{locale === "so" ? product.descriptionSo ?? product.description : product.description}</p>}
          <div className="mt-6 grid gap-3">
            {product.variants.filter((item) => item.isActive).length === 1 && !Object.keys(product.variants[0]?.attributes ?? {}).length ? (
              <div className="flex items-center justify-between rounded-xl bg-[#f5f8f6] p-4">
                <p className="text-sm font-semibold text-[#123b35]">Standard product option</p>
                <div className="text-end">
                  <p className="font-bold text-[#123b35]">${Number(product.variants[0]?.price ?? 0).toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{product.variants[0]?.stockQuantity ? `${product.variants[0].stockQuantity} ${t("shop.inStock")}` : t("shop.outOfStock")}</p>
                </div>
              </div>
            ) : product.variants.filter((item) => item.isActive).map((item) => (
              <button key={item.id} type="button" disabled={item.stockQuantity < 1} onClick={() => setSelected(item.id)} className={`flex items-center justify-between rounded-xl border p-4 text-start disabled:cursor-not-allowed disabled:opacity-60 ${selected === item.id ? "border-[#123b35] bg-[#f5f8f6]" : "border-[#e1e9e5] bg-white"}`}>
                <div>
                  <p className="font-semibold text-[#123b35]">{item.variantName}</p>
                  {Object.entries(item.attributes ?? {}).map(([key, value]) => <p key={key} className="text-xs text-slate-600">{key}: {value}</p>)}
                  <p className="text-xs text-slate-500">SKU {item.sku}</p>
                </div>
                <div className="text-end"><p className="font-bold text-[#123b35]">${Number(item.price).toFixed(2)}</p><p className="text-xs text-slate-500">{item.stockQuantity > 0 ? `${item.stockQuantity} ${t("shop.inStock")}` : t("shop.outOfStock")}</p></div>
              </button>
            ))}
          </div>
          <label className="mt-4 grid max-w-32 gap-1 text-sm font-semibold">{t("shop.quantity")}<input type="number" min={1} max={variant?.stockQuantity ?? 1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="rounded-lg border border-[#d5dfda] px-3 py-2" /></label>
          {message && <p className="mt-3 text-sm text-green-800">{message}</p>}
          <button
            type="button"
            disabled={soldOut || !validQuantity || addingToCart}
            onClick={async () => {
              if (!variant || !validQuantity) return;
              setAddingToCart(true);
              setError(null);
              try {
                await addCartItem(variant.id, quantity);
                setMessage(t("shop.addToCart"));
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
              } finally {
                setAddingToCart(false);
              }
            }}
            className="mt-6 w-full rounded-xl bg-[#f4b942] px-4 py-3 font-bold text-[#123b35] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {soldOut ? t("shop.outOfStock") : t("shop.addToCart")}
          </button>
        </div>
      </div>
      <section className="mt-10 rounded-2xl border border-[#e1e9e5] bg-white p-5">
        <div className="flex items-center gap-4">
          {product.vendor.vendorProfile?.files[0] && !logoBroken
            ? <Image src={`/api/v1/vendors/${product.vendor.id}/logo`} alt="" width={72} height={72} unoptimized onError={() => setLogoBroken(true)} className="size-[72px] rounded-xl border border-[#e1e9e5] object-cover" />
            : <span aria-hidden="true" className="grid size-[72px] place-items-center rounded-xl bg-[#123b35] text-2xl font-bold text-[#f4b942]">{(product.vendor.vendorProfile?.storeName ?? product.vendor.displayName ?? "S").slice(0, 1).toUpperCase()}</span>}
          <div>
            <h2 className="text-xl font-bold text-[#123b35]">{product.vendor.vendorProfile?.storeName ?? product.vendor.displayName}</h2>
            {(product.vendor.vendorProfile?.city || product.vendor.vendorProfile?.region || product.vendor.vendorProfile?.country) && <p className="mt-1 text-sm text-slate-600">{[product.vendor.vendorProfile.city, product.vendor.vendorProfile.region, product.vendor.vendorProfile.country].filter(Boolean).join(", ")}</p>}
            <Link href={`/${locale}/marketplace?vendorId=${product.vendor.id}`} className="mt-2 inline-block text-sm font-semibold text-[#8b5e08] hover:underline">Visit this store</Link>
          </div>
        </div>
        {product.purchaseCount > 0 && <p className="mt-4 text-sm text-slate-700">Customers purchased this product in {product.purchaseCount} completed order{product.purchaseCount === 1 ? "" : "s"}.</p>}
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-bold">Product reviews</h2>
        {product.reviewCount > 0
          ? <p className="mt-1 text-sm text-slate-600">{t("shop.reviewSummary").replace("{rating}", product.ratingAverage.toFixed(1)).replace("{count}", String(product.reviewCount))}</p>
          : <p className="mt-2 text-sm text-slate-600">No reviews yet.</p>}
        {product.reviewCount > 0 && (
          <div className="mt-4 max-w-md space-y-2" aria-label="Rating distribution">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = product.ratingDistribution[String(rating)] ?? 0;
              return (
                <div key={rating} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 text-xs text-slate-600">
                  <span>{rating}★</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full bg-[#f4b942]" style={{ width: `${product.reviewCount ? count / product.reviewCount * 100 : 0}%` }} />
                  </span>
                  <span className="text-end">{count}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 grid gap-3">
          {(product.reviews ?? []).map((review) => (
            <article id={`review-${review.id}`} key={review.id} className="rounded-xl border border-[#e1e9e5] p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#123b35] font-bold text-[#f4b942]">{(review.customer.displayName ?? "C").slice(0, 1).toUpperCase()}</span>
                <div>
                  <p className="font-semibold">{review.customer.displayName ?? "Customer"}</p>
                  <p className="text-sm text-amber-700" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                  <p className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString(locale)} · {review.verifiedPurchase ? "Verified purchase" : "Customer review"}</p>
                  {review.comment && <p className="mt-2 text-sm text-slate-600">{review.comment}</p>}
                  {review.photoKey && <Image src={`/api/v1/reviews/${review.id}/photo`} alt="Customer review photo" width={640} height={480} unoptimized className="mt-3 max-h-72 w-auto rounded-lg object-contain" />}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {viewerOpen && selectedImage && !brokenImages.has(selectedImage.id) && (
        <div role="dialog" aria-modal="true" aria-label="Product image viewer" className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX;
          if (touchStartX.current !== null && endX !== undefined && Math.abs(endX - touchStartX.current) > 40) moveImage(endX < touchStartX.current ? 1 : -1);
          touchStartX.current = null;
        }}>
          <button type="button" aria-label="Close image viewer" onClick={() => setViewerOpen(false)} className="absolute end-4 top-4 rounded-full bg-white px-4 py-2 font-semibold text-[#123b35]">Close</button>
          {images.length > 1 && <button type="button" aria-label="Previous image" onClick={() => moveImage(-1)} className="absolute start-3 rounded-full bg-white px-4 py-2 text-2xl text-[#123b35]">‹</button>}
          <Image src={`/api/v1/products/images/${selectedImage.id}`} alt={product.name} width={1600} height={1600} unoptimized onError={() => markImageBroken(selectedImage.id)} className="max-h-[85vh] max-w-[90vw] object-contain" />
          {images.length > 1 && <button type="button" aria-label="Next image" onClick={() => moveImage(1)} className="absolute end-3 rounded-full bg-white px-4 py-2 text-2xl text-[#123b35]">›</button>}
        </div>
      )}
    </main>
  );
}
