"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";
import { addCartItem } from "@/features/commerce/cart-api";

const productSchema = z.object({
  id: z.string(),
  ratingAverage: z.number(),
  reviewCount: z.number(),
  purchaseCount: z.number(),
  name: z.string(),
  nameSo: z.string().nullable(),
  brand: z.string().nullable().optional(),
  category: z.object({ name: z.string(), nameSo: z.string().nullable(), slug: z.string() }),
  vendor: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    vendorProfile: z.object({ storeName: z.string().nullable(), files: z.array(z.object({ id: z.string() })) }).nullable(),
  }),
  variants: z.array(z.object({ id: z.string(), price: z.union([z.string(), z.number()]), stockQuantity: z.number(), isActive: z.boolean() })),
  images: z.array(z.object({ id: z.string(), isPrimary: z.boolean() })),
});
const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameSo: z.string().nullable(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
});

export function LiveCatalogSection({
  locale,
  search = "",
}: Readonly<{ locale: Locale; search?: string }>) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<z.infer<typeof productSchema>[]>([]);
  const [categories, setCategories] = useState<z.infer<typeof categorySchema>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ limit: "8", sort: "newest" });
    if (search.trim()) query.set("search", search.trim());
    Promise.all([
      requestApi(`/api/v1/products?${query}`, z.object({ products: z.array(productSchema) }), t("shop.noResults")),
      requestApi("/api/v1/categories", z.object({ categories: z.array(categorySchema) }), t("shop.noResults")),
    ])
      .then(([productResult, categoryResult]) => {
        setProducts(productResult.products);
        setCategories(categoryResult.categories.filter((item) => !item.parentId));
        setError(null);
      })
      .catch((reason: unknown) => {
        setProducts([]);
        setCategories([]);
        setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
      })
      .finally(() => setLoading(false));
  }, [search, t]);

  return (
    <section id="featured-products" className="bg-[#f3f5ff]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a06c0b]">{t("shop.exploreCategories")}</p>
          <h2 className="text-2xl font-bold tracking-tight text-[#123b35] sm:text-3xl">{t("header.nav.categories")}</h2>
        </div>
        <div className="mb-12 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/${locale}/marketplace?category=${encodeURIComponent(category.slug)}`}
              className="rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <h3 className="font-semibold text-[#123b35]">{locale === "so" ? category.nameSo || category.name : category.name}</h3>
            </Link>
          ))}
        </div>
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a06c0b]">{t("shop.featured")}</p>
            <h2 className="text-2xl font-bold tracking-tight text-[#123b35] sm:text-3xl">{search ? t("shop.searchResults") : t("shop.newArrivals")}</h2>
          </div>
          <Link href={`/${locale}/marketplace`} className="text-sm font-semibold text-[#8b5e08] hover:underline">{t("shop.products")}</Link>
        </div>
        {loading && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-white" />)}</div>}
        {!loading && !error && products.length === 0 && (
          <p className="rounded-xl border border-[#dce4e1] bg-white px-4 py-10 text-center text-sm text-slate-600">{t("shop.emptyCatalog")}</p>
        )}
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {products.map((product) => {
            const prices = product.variants.filter((item) => item.isActive).map((item) => Number(item.price));
            const image = product.images[0];
            const availableVariant = product.variants.find((item) => item.isActive && item.stockQuantity > 0);
            const inStock = Boolean(availableVariant);
            return (
              <article key={product.id} className="rounded-xl border border-[#e1e9e5] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <Link href={`/${locale}/marketplace/${product.id}`} className="block">
                  <div className="relative">
                    {image ? (
                      <Image src={`/api/v1/products/images/${image.id}`} alt={locale === "so" ? product.nameSo || product.name : product.name} width={640} height={640} unoptimized className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div className="grid aspect-square place-items-center rounded-lg bg-[#f5f8f6] text-sm text-slate-500">{t("vendor.noImage")}</div>
                    )}
                    {product.vendor.vendorProfile?.files[0] && <Image src={`/api/v1/vendors/${product.vendor.id}/logo`} alt="" width={48} height={48} unoptimized className="absolute bottom-2 end-2 size-10 rounded-full border-2 border-white bg-white object-cover shadow" />}
                  </div>
                  <h3 className="mt-3 truncate font-semibold text-[#123b35]">{locale === "so" ? product.nameSo || product.name : product.name}</h3>
                  <p className="text-xs text-slate-500">{product.vendor.vendorProfile?.storeName ?? product.vendor.displayName}</p>
                  <p className="mt-2 font-bold text-[#123b35]">{prices.length ? `$${Math.min(...prices).toFixed(2)}` : "—"}</p>
                  <p className="text-xs text-slate-500">{inStock ? t("shop.inStock") : t("shop.outOfStock")}</p>
                  <p className="mt-1 text-xs text-slate-600">{t("shop.reviewSummary").replace("{rating}", product.reviewCount ? product.ratingAverage.toFixed(1) : "—").replace("{count}", String(product.reviewCount))}</p>
                  {product.purchaseCount > 0 && <p className="text-xs text-slate-600">{t("shop.purchaseSummary").replace("{count}", String(product.purchaseCount))}</p>}
                </Link>
                <button
                  type="button"
                  disabled={!availableVariant}
                  onClick={() => {
                    if (!availableVariant) return;
                    void addCartItem(availableVariant.id).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("auth.requestFailed")));
                  }}
                  className="mt-3 w-full rounded-lg bg-[#f4b942] px-3 py-2 text-sm font-bold text-[#123b35] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inStock ? t("shop.addToCart") : t("shop.outOfStock")}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
