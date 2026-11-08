"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  MessageSquareText,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  X,
} from "lucide-react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { addCartItem } from "@/features/commerce/cart-api";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const relatedProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameSo: z.string().nullable(),
  price: z.string(),
  compareAtPrice: z.string().nullable().optional(),
  stockQuantity: z.number(),
  imageId: z.string().nullable(),
});

const productSchema = z.object({
  id: z.string(),
  ratingAverage: z.number(),
  reviewCount: z.number(),
  ratingDistribution: z.record(z.string(), z.number()),
  purchaseCount: z.number(),
  vendorRatingAverage: z.number().optional().default(0),
  vendorReviewCount: z.number().optional().default(0),
  name: z.string(),
  nameSo: z.string().nullable(),
  description: z.string().nullable(),
  descriptionSo: z.string().nullable(),
  brand: z.string().nullable().optional(),
  category: z.object({
    id: z.string().optional(),
    name: z.string(),
    nameSo: z.string().nullable(),
    slug: z.string().optional(),
  }),
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
  variants: z.array(
    z.object({
      id: z.string(),
      sku: z.string(),
      variantName: z.string(),
      attributes: z.record(z.string(), z.string()).nullable().optional(),
      price: z.union([z.string(), z.number()]),
      compareAtPrice: z.union([z.string(), z.number()]).nullable().optional(),
      stockQuantity: z.number(),
      isActive: z.boolean(),
    }),
  ),
  images: z.array(z.object({ id: z.string(), isPrimary: z.boolean() })),
  reviews: z.array(
    z.object({
      id: z.string(),
      rating: z.number(),
      comment: z.string().nullable(),
      photoKey: z.string().nullable(),
      verifiedPurchase: z.boolean(),
      createdAt: z.string(),
      customer: z.object({ displayName: z.string().nullable() }),
    }),
  ).optional().default([]),
  relatedProducts: z.array(relatedProductSchema).optional().default([]),
});

type Product = z.infer<typeof productSchema>;

export default function ProductDetailClient({
  productId,
  locale,
}: Readonly<{
  productId: string;
  locale: "en" | "so";
}>) {
  const { t } = useTranslation();
  const router = useRouter();
  const isSomali = locale === "so";

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccessMessage, setCartSuccessMessage] = useState<string | null>(null);
  const [contactingVendor, setContactingVendor] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [sharingProduct, setSharingProduct] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  // Gallery states
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [activeDescTab, setActiveDescTab] = useState<"en" | "so">(locale);

  const loadProduct = useCallback(async () => {
    try {
      const result = await requestApi(
        `/api/v1/products/${productId}`,
        z.object({ product: productSchema }),
        t("auth.requestFailed"),
      );
      setProduct(result.product);

      setSelectedImageId((curr) => curr ?? result.product.images[0]?.id ?? null);

      setSelectedVariantId((curr) => {
        if (curr && result.product.variants.some((v) => v.id === curr && v.isActive)) {
          return curr;
        }
        const firstInStock = result.product.variants.find((v) => v.isActive && v.stockQuantity > 0);
        return firstInStock?.id ?? result.product.variants.find((v) => v.isActive)?.id ?? null;
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [productId, t]);

  useVisiblePolling(loadProduct, 30_000);

  const images = useMemo(() => product?.images ?? [], [product?.images]);
  const selectedIndex = Math.max(
    0,
    images.findIndex((img) => img.id === selectedImageId),
  );
  const selectedImage = images[selectedIndex];

  // Keyboard navigation for image viewer
  useEffect(() => {
    if (!viewerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerOpen(false);
      if (e.key === "ArrowRight" && images.length > 1) {
        setSelectedImageId(images[(selectedIndex + 1) % images.length]?.id ?? null);
      }
      if (e.key === "ArrowLeft" && images.length > 1) {
        setSelectedImageId(images[(selectedIndex - 1 + images.length) % images.length]?.id ?? null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images, selectedIndex, viewerOpen]);

  const markImageBroken = (id: string) => {
    setBrokenImages((prev) => new Set(prev).add(id));
  };

  const navigateImage = (direction: -1 | 1) => {
    if (!images.length) return;
    const nextIdx = (selectedIndex + direction + images.length) % images.length;
    setSelectedImageId(images[nextIdx]?.id ?? null);
  };

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-800">
          <AlertCircle className="mx-auto size-12 text-red-600" />
          <h2 className="mt-3 text-xl font-bold">{isSomali ? "Alaabta lama helin" : "Product Not Found"}</h2>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <Link
            href={`/${locale}/marketplace`}
            className="mt-6 inline-block rounded-xl bg-[#123b35] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#194a43]"
          >
            {isSomali ? "Ku noqo suuqa" : "Return to Marketplace"}
          </Link>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="animate-pulse grid gap-8 md:grid-cols-2">
          <div className="aspect-square rounded-2xl bg-slate-200" />
          <div className="space-y-4">
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="h-8 w-3/4 rounded bg-slate-200" />
            <div className="h-6 w-1/3 rounded bg-slate-200" />
            <div className="h-24 w-full rounded bg-slate-200" />
          </div>
        </div>
      </main>
    );
  }

  const activeVariants = product.variants.filter((v) => v.isActive);
  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? activeVariants[0];
  const isOutOfStock = !selectedVariant || selectedVariant.stockQuantity < 1;
  const currentPrice = Number(selectedVariant?.price ?? 0);
  const comparePrice = selectedVariant?.compareAtPrice ? Number(selectedVariant.compareAtPrice) : null;
  const hasDiscount = comparePrice !== null && comparePrice > currentPrice;
  const discountPercent = hasDiscount ? Math.round(((comparePrice - currentPrice) / comparePrice) * 100) : 0;

  const maxAvailable = selectedVariant?.stockQuantity ?? 0;
  const isQuantityValid = quantity >= 1 && quantity <= maxAvailable;

  const storeName = product.vendor.vendorProfile?.storeName ?? product.vendor.displayName ?? (isSomali ? "Iibiye" : "Vendor");
  const storeLocation = [
    product.vendor.vendorProfile?.city,
    product.vendor.vendorProfile?.region,
    product.vendor.vendorProfile?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > maxAvailable) return maxAvailable;
      return next;
    });
  };

  const handleAddToCart = async (redirectToCheckout = false) => {
    if (!selectedVariant || isOutOfStock || !isQuantityValid || addingToCart) return;
    setAddingToCart(true);
    setCartSuccessMessage(null);
    setError(null);
    try {
      await addCartItem(selectedVariant.id, quantity);
      if (redirectToCheckout) {
        router.push(`/${locale}/checkout`);
      } else {
        setCartSuccessMessage(
          isSomali
            ? `${quantity} x ${product.nameSo ?? product.name} ayaa lagu daray gaarigaaga!`
            : `Added ${quantity} x ${product.name} to your shopping cart!`,
        );
        setTimeout(() => setCartSuccessMessage(null), 5000);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("auth.requestFailed");
      await loadProduct();
      setError(message);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleContactVendor = async () => {
    setContactingVendor(true);
    setContactError(null);
    try {
      const result = await requestApi(
        "/api/v1/conversations",
        z.object({ conversationId: z.string(), liveDelivery: z.boolean() }),
        t("communications.contactVendorFailed"),
        postJson({ productId: product.id }),
      );
      router.push(`/${locale}/customer/messages?conversationId=${result.conversationId}`);
    } catch (reason) {
      setContactError(
        reason instanceof Error ? reason.message : t("communications.contactVendorFailed"),
      );
    } finally {
      setContactingVendor(false);
    }
  };

  const handleShareProduct = async () => {
    if (sharingProduct) return;
    setSharingProduct(true);
    setShareMessage(null);
    const url = window.location.href;
    const title = isSomali ? product.nameSo ?? product.name : product.name;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage(isSomali ? "Xiriirka alaabta waa la koobiyey!" : "Product link copied to clipboard!");
        setTimeout(() => setShareMessage(null), 4000);
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setShareMessage(isSomali ? "Lama wadaagi karin." : "Could not share link.");
    } finally {
      setSharingProduct(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href={`/${locale}/marketplace`} className="hover:text-[#123b35] hover:underline">
          {isSomali ? "Suuqa" : "Marketplace"}
        </Link>
        <span>/</span>
        <span className="text-[#a06c0b] font-semibold">
          {isSomali ? product.category.nameSo ?? product.category.name : product.category.name}
        </span>
        <span>/</span>
        <span className="truncate max-w-xs text-slate-800 font-medium">
          {isSomali ? product.nameSo ?? product.name : product.name}
        </span>
      </nav>

      {/* Main Product Layout */}
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Left: Product Image Gallery */}
        <section aria-label="Product Gallery" className="space-y-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-[#e1e9e5] bg-[#f8faf9] shadow-sm">
            {selectedImage && !brokenImages.has(selectedImage.id) ? (
              <>
                <button
                  type="button"
                  onClick={() => setViewerOpen(true)}
                  aria-label={isSomali ? "Weynee sawirka" : "Click to view full image"}
                  className="group relative size-full cursor-zoom-in"
                >
                  <Image
                    src={`/api/v1/products/images/${selectedImage.id}`}
                    alt={isSomali ? product.nameSo ?? product.name : product.name}
                    width={1000}
                    height={1000}
                    priority
                    unoptimized
                    onError={() => markImageBroken(selectedImage.id)}
                    className="size-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                  />
                </button>

                {/* Left / Right Arrow Navigation */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigateImage(-1)}
                      aria-label={isSomali ? "Sawirkii hore" : "Previous image"}
                      className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 p-2 text-[#123b35] shadow-md transition hover:bg-white active:scale-95"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateImage(1)}
                      aria-label={isSomali ? "Sawirka xiga" : "Next image"}
                      className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 p-2 text-[#123b35] shadow-md transition hover:bg-white active:scale-95"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="grid size-full place-items-center text-slate-400">
                <p className="text-sm">{t("vendor.noImage")}</p>
              </div>
            )}

            {/* Badges Overlay */}
            <div className="absolute start-3 top-3 flex flex-col gap-1.5">
              {hasDiscount && (
                <span className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
                  {discountPercent}% OFF
                </span>
              )}
              {isOutOfStock && (
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
                  {isSomali ? "Dhammaystiran" : "Out of Stock"}
                </span>
              )}
            </div>
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-2" role="tablist">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImageId(img.id)}
                  aria-label={`Thumbnail ${idx + 1}`}
                  aria-pressed={selectedImageId === img.id}
                  className={`relative size-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    selectedImageId === img.id
                      ? "border-[#123b35] ring-2 ring-[#123b35]/20"
                      : "border-[#e1e9e5] opacity-70 hover:opacity-100"
                  }`}
                >
                  {brokenImages.has(img.id) ? (
                    <span className="grid size-full place-items-center bg-slate-100 text-[10px] text-slate-400">
                      N/A
                    </span>
                  ) : (
                    <Image
                      src={`/api/v1/products/images/${img.id}`}
                      alt=""
                      width={100}
                      height={100}
                      unoptimized
                      onError={() => markImageBroken(img.id)}
                      className="size-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: Product Details & Purchase Form */}
        <section aria-label="Product Options and Actions" className="flex flex-col">
          {/* Category & SKU */}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="uppercase tracking-wider text-[#a06c0b]">
              {isSomali ? product.category.nameSo ?? product.category.name : product.category.name}
            </span>
            {selectedVariant && (
              <span className="font-mono text-slate-400">SKU: {selectedVariant.sku}</span>
            )}
          </div>

          {/* Bilingual Product Titles */}
          <h1 className="mt-2 text-2xl font-bold text-[#123b35] sm:text-3xl">
            {isSomali ? product.nameSo ?? product.name : product.name}
          </h1>
          {product.nameSo && product.name && product.nameSo !== product.name && (
            <p className="mt-1 text-sm font-medium text-slate-500">
              {isSomali ? product.name : product.nameSo}
            </p>
          )}

          {/* Ratings & Reviews summary */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center text-amber-500">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`size-4 ${
                    star <= Math.round(product.ratingAverage)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-200"
                  }`}
                />
              ))}
            </div>
            <a
              href="#product-reviews"
              className="text-xs font-semibold text-[#8b5e08] hover:underline"
            >
              {product.ratingAverage.toFixed(1)} ({product.reviewCount} {isSomali ? "qiimayn" : "reviews"})
            </a>
            {product.purchaseCount > 0 && (
              <span className="text-xs text-slate-400">
                · {product.purchaseCount} {isSomali ? "iibsi" : "orders"}
              </span>
            )}
          </div>

          {/* Price & Discounts */}
          <div className="mt-5 rounded-2xl border border-[#e1e9e5] bg-[#f8faf9] p-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-extrabold text-[#123b35]">
                ${currentPrice.toFixed(2)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-lg text-slate-400 line-through">
                    ${comparePrice!.toFixed(2)}
                  </span>
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                    {discountPercent}% {isSomali ? "Dhimis" : "OFF"}
                  </span>
                </>
              )}
            </div>

            {/* Stock Availability */}
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${
                  isOutOfStock
                    ? "bg-red-500"
                    : maxAvailable <= 5
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
              />
              <span
                className={`text-xs font-semibold ${
                  isOutOfStock
                    ? "text-red-700"
                    : maxAvailable <= 5
                      ? "text-amber-700"
                      : "text-emerald-800"
                }`}
              >
                {isOutOfStock
                  ? isSomali
                    ? "Alaabtan way go'day (Out of Stock)"
                    : "Currently Out of Stock"
                  : maxAvailable <= 5
                    ? isSomali
                      ? `Kaliya ${maxAvailable} baa haray!`
                      : `Only ${maxAvailable} units remaining!`
                    : isSomali
                      ? `Diyaar (${maxAvailable} xabbo baa yaal)`
                      : `In Stock (${maxAvailable} units available)`}
              </span>
            </div>
          </div>

          {/* Variant Selection */}
          {activeVariants.length > 1 && (
            <div className="mt-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#123b35]">
                {isSomali ? "Dooro Nooca" : "Select Option / Variant"}
              </label>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {activeVariants.map((item) => {
                  const out = item.stockQuantity < 1;
                  const selected = selectedVariant?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={out}
                      onClick={() => {
                        setSelectedVariantId(item.id);
                        setQuantity(1);
                      }}
                      className={`flex flex-col rounded-xl border p-3 text-start transition ${
                        selected
                          ? "border-[#123b35] bg-[#123b35]/5 ring-1 ring-[#123b35]"
                          : out
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                            : "border-[#e1e9e5] bg-white hover:border-[#123b35]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#123b35] text-sm">{item.variantName}</span>
                        <span className="font-bold text-[#123b35] text-sm">${Number(item.price).toFixed(2)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {Object.entries(item.attributes ?? {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ") || `SKU: ${item.sku}`}
                        </span>
                        <span className={out ? "font-bold text-red-600" : ""}>
                          {out ? (isSomali ? "Go'day" : "Out of stock") : `${item.stockQuantity} ${isSomali ? "yaal" : "left"}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Selector with Stock Validation */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#123b35]">
              {isSomali ? "Tirada" : "Quantity"}
            </span>
            <div className="flex items-center rounded-xl border border-[#d5dfda] bg-white">
              <button
                type="button"
                disabled={isOutOfStock || quantity <= 1}
                onClick={() => handleQuantityChange(-1)}
                aria-label="Decrease quantity"
                className="grid size-10 place-items-center rounded-s-xl text-[#123b35] transition hover:bg-slate-100 disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-12 text-center font-bold text-[#123b35]">{quantity}</span>
              <button
                type="button"
                disabled={isOutOfStock || quantity >= maxAvailable}
                onClick={() => handleQuantityChange(1)}
                aria-label="Increase quantity"
                className="grid size-10 place-items-center rounded-e-xl text-[#123b35] transition hover:bg-slate-100 disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {maxAvailable > 0 && quantity >= maxAvailable && (
              <span className="text-xs font-semibold text-amber-700">
                {isSomali ? "Tirada ugu badan ee la heli karo" : "Maximum available quantity"}
              </span>
            )}
          </div>

          {/* Cart Feedback Notice */}
          {cartSuccessMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              <Check className="size-5 shrink-0 text-emerald-600" />
              <span className="flex-1 font-medium">{cartSuccessMessage}</span>
              <Link href={`/${locale}/cart`} className="font-bold underline hover:text-emerald-950">
                {isSomali ? "Eeg gaariga" : "View Cart"}
              </Link>
            </div>
          )}

          {/* Primary Action Buttons: Add to Cart & Buy Now */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={isOutOfStock || !isQuantityValid || addingToCart}
              onClick={() => void handleAddToCart(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f4b942] px-6 py-3.5 font-bold text-[#123b35] shadow-sm transition hover:bg-[#e9af39] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="size-5" />
              {addingToCart
                ? isSomali
                  ? "Lagu darayaa..."
                  : "Adding..."
                : isOutOfStock
                  ? isSomali
                    ? "Waa Go'day"
                    : "Out of Stock"
                  : isSomali
                    ? "Ku dar Gaariga"
                    : "Add to Cart"}
            </button>

            <button
              type="button"
              disabled={isOutOfStock || !isQuantityValid || addingToCart}
              onClick={() => void handleAddToCart(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#123b35] px-6 py-3.5 font-bold text-white shadow-sm transition hover:bg-[#194a43] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="size-5" />
              {isSomali ? "Iibso Hadda" : "Buy Now"}
            </button>
          </div>

          {/* Secondary Actions: Contact Vendor & Share */}
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              disabled={contactingVendor}
              onClick={() => void handleContactVendor()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#123b35] bg-white px-4 py-2.5 text-sm font-bold text-[#123b35] transition hover:bg-[#f5f8f6] disabled:opacity-50"
            >
              <MessageSquareText className="size-4" />
              {contactingVendor
                ? isSomali
                  ? "Furaya xiriirka..."
                  : "Starting chat..."
                : isSomali
                  ? `La xiriir Iibiyaha (${storeName})`
                  : `Contact Vendor (${storeName})`}
            </button>

            <button
              type="button"
              disabled={sharingProduct}
              onClick={() => void handleShareProduct()}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#dce4e1] bg-white px-4 py-2.5 text-sm font-semibold text-[#123b35] transition hover:bg-[#f5f8f6] disabled:opacity-50"
            >
              <Share2 className="size-4" />
              {sharingProduct ? (isSomali ? "Wadaagaya..." : "Sharing...") : isSomali ? "Wadaag" : "Share"}
            </button>
          </div>

          {contactError && <p role="alert" className="mt-2 text-xs text-red-600">{contactError}</p>}
          {shareMessage && <p role="status" className="mt-2 text-xs text-slate-600">{shareMessage}</p>}

          {/* Vendor Card with Real Storefront Link */}
          <div className="mt-8 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
              {product.vendor.vendorProfile?.files[0] && !logoBroken ? (
                <Image
                  src={`/api/v1/vendors/${product.vendor.id}/logo`}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  onError={() => setLogoBroken(true)}
                  className="size-16 rounded-xl border border-[#e1e9e5] object-cover"
                />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#123b35] text-2xl font-bold text-[#f4b942]">
                  {storeName.slice(0, 1).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-[#123b35]">{storeName}</h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {isSomali ? "Iibiye La Hubiyey" : "Verified Store"}
                  </span>
                </div>
                {storeLocation && <p className="mt-1 text-xs text-slate-500">{storeLocation}</p>}

                {product.vendorRatingAverage > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-bold">{product.vendorRatingAverage.toFixed(1)}</span>
                    <span className="text-slate-400">({product.vendorReviewCount} {isSomali ? "qiimayn dukaanka" : "store reviews"})</span>
                  </p>
                )}

                <Link
                  href={`/${locale}/stores/${product.vendor.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#8b5e08] hover:underline"
                >
                  <Store className="size-3.5" />
                  {isSomali ? "Booqo Dukaankan (Visit this store)" : "Visit this store"}
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Description & Product Info Tabs */}
      <section className="mt-12 rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm">
        <div className="flex border-b border-[#e1e9e5]" role="tablist">
          <button
            type="button"
            onClick={() => setActiveDescTab("en")}
            role="tab"
            aria-selected={activeDescTab === "en"}
            className={`border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeDescTab === "en"
                ? "border-[#123b35] text-[#123b35]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Description (English)
          </button>
          <button
            type="button"
            onClick={() => setActiveDescTab("so")}
            role="tab"
            aria-selected={activeDescTab === "so"}
            className={`border-b-2 px-5 py-3 text-sm font-bold transition ${
              activeDescTab === "so"
                ? "border-[#123b35] text-[#123b35]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Faahfaahinta (Somali)
          </button>
        </div>

        <div className="pt-6">
          {activeDescTab === "so" ? (
            product.descriptionSo ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {product.descriptionSo}
              </p>
            ) : (
              <p className="text-sm italic text-slate-400">
                Faahfaahin af-Soomaali ah weli lama gelin. Fadlan eeg faahfaahinta Ingiriisiga ah.
              </p>
            )
          ) : product.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {product.description}
            </p>
          ) : (
            <p className="text-sm italic text-slate-400">No English description provided.</p>
          )}

          {product.brand && (
            <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{isSomali ? "Sumadda" : "Brand"}:</span> {product.brand}
            </div>
          )}
        </div>
      </section>

      {/* Customer Reviews Section */}
      <section id="product-reviews" className="mt-12 rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-[#123b35]">
          {isSomali ? "Qiimaynta Macaamiisha" : "Customer Reviews"}
        </h2>

        {product.reviewCount > 0 ? (
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {/* Average & Distribution Card */}
            <div className="rounded-xl border border-slate-100 bg-[#f8faf9] p-5 text-center md:col-span-1">
              <p className="text-4xl font-extrabold text-[#123b35]">
                {product.ratingAverage.toFixed(1)}
              </p>
              <div className="mt-2 flex justify-center text-amber-400">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`size-4 ${
                      star <= Math.round(product.ratingAverage) ? "fill-amber-400" : "text-slate-200"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {isSomali
                  ? `Waxaa qiimeeyey ${product.reviewCount} macmiil`
                  : `Based on ${product.reviewCount} reviews`}
              </p>

              {/* Star Distribution */}
              <div className="mt-4 space-y-1.5 text-xs">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = product.ratingDistribution[String(rating)] ?? 0;
                  const pct = product.reviewCount ? (count / product.reviewCount) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-2 text-slate-600">
                      <span className="w-6 text-end">{rating}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-[#f4b942]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-start text-slate-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reviews List */}
            <div className="space-y-4 md:col-span-2">
              {(product.reviews ?? []).map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-[#e1e9e5] bg-white p-4 transition hover:border-[#123b35]/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-full bg-[#123b35] text-xs font-bold text-[#f4b942]">
                        {(review.customer.displayName ?? "C").slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#123b35]">
                          {review.customer.displayName ?? (isSomali ? "Macmiil" : "Customer")}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="text-amber-600 font-bold">{"★".repeat(review.rating)}</span>
                          <span>·</span>
                          <time dateTime={review.createdAt}>
                            {new Date(review.createdAt).toLocaleDateString(locale)}
                          </time>
                        </div>
                      </div>
                    </div>
                    {review.verifiedPurchase && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <ShieldCheck className="size-3 text-emerald-600" />
                        {isSomali ? "Iibsi la xaqiijiyey" : "Verified Purchase"}
                      </span>
                    )}
                  </div>
                  {review.comment && (
                    <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {review.comment}
                    </p>
                  )}
                  {review.photoKey && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 w-fit">
                      <Image
                        src={`/api/v1/reviews/${review.id}/photo`}
                        alt="Customer review photo"
                        width={300}
                        height={300}
                        unoptimized
                        className="max-h-48 w-auto object-cover"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-[#f8faf9] p-8 text-center text-slate-500">
            <p className="text-sm">
              {isSomali
                ? "Alaabtan weli ma helin wax qiimayn ah. Noqo qofka ugu horreeya ee qiimeeya markaad iibsato!"
                : "No customer reviews yet. Be the first to review after purchasing!"}
            </p>
          </div>
        )}
      </section>

      {/* Related Products from Database */}
      {product.relatedProducts && product.relatedProducts.length > 0 && (
        <section aria-label="Related Products" className="mt-14">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[#123b35]">
              {isSomali ? "Alaabooyinka Ku Xiran" : "Related Products"}
            </h2>
            <Link
              href={`/${locale}/marketplace`}
              className="text-xs font-bold text-[#8b5e08] hover:underline"
            >
              {isSomali ? "Eeg dhammaan →" : "View all →"}
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {product.relatedProducts.map((rel) => {
              const relName = isSomali ? rel.nameSo ?? rel.name : rel.name;
              return (
                <Link
                  key={rel.id}
                  href={`/${locale}/marketplace/${rel.id}`}
                  className="group flex flex-col rounded-2xl border border-[#e1e9e5] bg-white p-3 shadow-sm transition hover:border-[#123b35]/30 hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#f8faf9]">
                    {rel.imageId ? (
                      <Image
                        src={`/api/v1/products/images/${rel.imageId}`}
                        alt={relName}
                        width={400}
                        height={400}
                        unoptimized
                        className="size-full object-contain p-2 transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-xs text-slate-400">
                        {t("vendor.noImage")}
                      </span>
                    )}
                    {rel.stockQuantity < 1 && (
                      <span className="absolute start-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white">
                        {isSomali ? "Go'day" : "Sold out"}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 line-clamp-1 text-sm font-semibold text-[#123b35] group-hover:text-[#a06c0b]">
                    {relName}
                  </h3>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-[#123b35]">${rel.price}</span>
                    {rel.compareAtPrice && Number(rel.compareAtPrice) > Number(rel.price) && (
                      <span className="text-xs text-slate-400 line-through">${rel.compareAtPrice}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Lightbox Modal */}
      {viewerOpen && selectedImage && !brokenImages.has(selectedImage.id) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Product image viewer"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            aria-label="Close image viewer"
            className="absolute end-4 top-4 grid size-10 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <X className="size-6" />
          </button>

          {images.length > 1 && (
            <button
              type="button"
              onClick={() => navigateImage(-1)}
              aria-label="Previous image"
              className="absolute start-4 top-1/2 -translate-y-1/2 grid size-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <ChevronLeft className="size-8" />
            </button>
          )}

          <Image
            src={`/api/v1/products/images/${selectedImage.id}`}
            alt={isSomali ? product.nameSo ?? product.name : product.name}
            width={1600}
            height={1600}
            unoptimized
            onError={() => markImageBroken(selectedImage.id)}
            className="max-h-[85vh] max-w-[90vw] object-contain"
          />

          {images.length > 1 && (
            <button
              type="button"
              onClick={() => navigateImage(1)}
              aria-label="Next image"
              className="absolute end-4 top-1/2 -translate-y-1/2 grid size-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <ChevronRight className="size-8" />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
