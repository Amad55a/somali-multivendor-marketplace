"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";
import { addCartItem } from "@/features/commerce/cart-api";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const productSchema = z.object({
  id: z.string(),
  ratingAverage: z.number(),
  reviewCount: z.number(),
  purchaseCount: z.number(),
  name: z.string(),
  nameSo: z.string().nullable(),
  brand: z.string().nullable().optional(),
  category: z.object({ name: z.string(), nameSo: z.string().nullable(), slug: z.string() }),
  vendor: z.object({ id: z.string(), displayName: z.string().nullable(), vendorProfile: z.object({ storeName: z.string().nullable(), files: z.array(z.object({ id: z.string() })) }).nullable() }),
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

export function MarketplaceBrowser({
  locale,
  initialSearch = "",
  initialCategory = "",
  initialVendorId = "",
}: Readonly<{ locale: Locale; initialSearch?: string; initialCategory?: string; initialVendorId?: string }>) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<z.infer<typeof productSchema>[]>([]);
  const [categories, setCategories] = useState<z.infer<typeof categorySchema>[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [vendorId] = useState(initialVendorId);
  const [sort, setSort] = useState("newest");
  const [city, setCity] = useState("");
  const [brand, setBrand] = useState("");
  const [inStock, setInStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCatalog = useCallback(async () => {
    const query = new URLSearchParams({ limit: "24", sort });
    if (search.trim()) query.set("search", search.trim());
    if (category) query.set("category", category);
    if (vendorId) query.set("vendorId", vendorId);
    if (city.trim()) query.set("city", city.trim());
    if (brand.trim()) query.set("brand", brand.trim());
    if (inStock) query.set("inStock", "true");
    try {
      const [productResult, categoryResult] = await Promise.all([
        requestApi(`/api/v1/products?${query}`, z.object({ products: z.array(productSchema), nextCursor: z.string().nullable() }), t("shop.noResults")),
        requestApi("/api/v1/categories", z.object({ categories: z.array(categorySchema) }), t("shop.noResults")),
      ]);
      setProducts(productResult.products);
      setCategories(categoryResult.categories.filter((item) => !item.parentId));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("shop.noResults"));
    } finally {
      setLoading(false);
    }
  }, [search, category, vendorId, sort, city, brand, inStock, t]);
  useVisiblePolling(loadCatalog, 30_000);

  const parents = categories;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">Somsuuq</p>
          <h1 className="mt-2 text-3xl font-bold text-[#123b35]">{search ? t("shop.searchResults") : t("shop.products")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("header.searchPlaceholder")} className="rounded-lg border border-[#d5dfda] px-3 py-2" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[#d5dfda] px-3 py-2">
            <option value="">{t("vendor.category")}</option>
            {parents.map((item) => <option key={item.id} value={item.slug}>{locale === "so" ? item.nameSo || item.name : item.name}</option>)}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-[#d5dfda] px-3 py-2">
            <option value="newest">{t("shop.sortNewest")}</option>
            <option value="price_asc">{t("shop.sortPriceAsc")}</option>
            <option value="price_desc">{t("shop.sortPriceDesc")}</option>
            <option value="best_rated">{t("shop.bestRated")}</option>
            <option value="best_selling">{t("shop.bestSelling")}</option>
          </select>
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="rounded-lg border border-[#d5dfda] px-3 py-2" />
          <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Brand" className="rounded-lg border border-[#d5dfda] px-3 py-2" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} /> In stock</label>
        </div>
      </div>
      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      {loading && <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-[#edf1ef]" />)}</div>}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((product) => {
          const prices = product.variants.filter((item) => item.isActive).map((item) => Number(item.price));
          const availableVariant = product.variants.find((item) => item.isActive && item.stockQuantity > 0);
          const inStock = Boolean(availableVariant);
          const image = product.images[0];
          return (
            <article key={product.id} className="rounded-xl border border-[#e1e9e5] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <Link href={`/${locale}/marketplace/${product.id}`} className="block">
                <div className="relative">
                  {image ? <Image src={`/api/v1/products/images/${image.id}`} alt={product.name} width={640} height={640} unoptimized className="aspect-square w-full rounded-lg object-cover" /> : <div className="grid aspect-square place-items-center rounded-lg bg-[#f5f8f6] text-sm text-slate-500">{t("vendor.noImage")}</div>}
                  {product.vendor.vendorProfile?.files[0] && <Image src={`/api/v1/vendors/${product.vendor.id}/logo`} alt="" width={48} height={48} unoptimized className="absolute bottom-2 end-2 size-10 rounded-full border-2 border-white bg-white object-cover shadow" />}
                </div>
                <h2 className="mt-3 truncate font-semibold text-[#123b35]">{locale === "so" ? product.nameSo || product.name : product.name}</h2>
              </Link>
              <Link href={`/${locale}/stores/${product.vendor.id}`} className="mt-1 block truncate text-xs text-slate-500 hover:text-[#8b5e08] hover:underline">
                {product.vendor.vendorProfile?.storeName ?? product.vendor.displayName}
              </Link>
              <Link href={`/${locale}/marketplace/${product.id}`} className="block">
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
                  void addCartItem(availableVariant.id).catch(async (reason: unknown) => {
                    const message = reason instanceof Error ? reason.message : t("shop.noResults");
                    await loadCatalog();
                    setError(message);
                  });
                }}
                className="mt-3 w-full rounded-lg bg-[#f4b942] px-3 py-2 text-sm font-bold text-[#123b35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inStock ? t("shop.addToCart") : t("shop.outOfStock")}
              </button>
            </article>
          );
        })}
      </div>
      {!loading && !error && products.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-slate-600">{t("shop.noResults")}</p>
          <p className="mt-2 text-sm text-slate-500">Try removing filters or using a different search.</p>
          <button type="button" onClick={() => { setSearch(""); setCategory(""); setCity(""); setBrand(""); setInStock(false); setSort("newest"); }} className="mt-4 rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white">Return to browsing</button>
        </div>
      )}
    </section>
  );
}
