"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Trash2, Upload } from "lucide-react";
import { z } from "zod";
import { postFormData, postJson, requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { buildVariantCombinations, suggestedProductOptions, type ProductOption } from "@/features/products/variant-options";

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameSo: z.string().nullable().optional(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
});
const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string(),
  variantName: z.string(),
  attributes: z.record(z.string(), z.string()).nullable().optional(),
  price: z.union([z.string(), z.number()]),
  stockQuantity: z.number(),
  isActive: z.boolean(),
});
const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameSo: z.string().nullable(),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  category: categorySchema,
  variants: z.array(variantSchema),
  images: z.array(z.object({ id: z.string(), storageKey: z.string(), isPrimary: z.boolean() })),
});

type VariantDraft = { variantName: string; sku: string; price: string; stockQuantity: string; attributes?: Record<string, string> };
type OptionDraft = ProductOption & { suggestedValues: string[] };
type Category = z.infer<typeof categorySchema>;

const emptyVariant = (): VariantDraft => ({ variantName: "Standard", sku: "", price: "", stockQuantity: "0" });

function categoryOptions(categories: Category[], selectedId: string, parentId: string) {
  const selected = categories.find((category) => category.id === selectedId);
  const parent = categories.find((category) => category.id === parentId);
  const suggested = suggestedProductOptions(selected ?? parent ?? null);
  return (suggested.length ? suggested : suggestedProductOptions(parent ?? null))
    .map((option) => ({ ...option, values: "", suggestedValues: option.suggestedValues }));
}

export function VendorProductManager() {
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<z.infer<typeof productSchema>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameSo, setNameSo] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionSo, setDescriptionSo] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [hasOptions, setHasOptions] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [basePrice, setBasePrice] = useState("");
  const [baseStockQuantity, setBaseStockQuantity] = useState("0");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [categoryResult, productResult] = await Promise.all([
      requestApi("/api/v1/categories", z.object({ categories: z.array(categorySchema) }), t("auth.requestFailed")),
      requestApi("/api/v1/vendor/products", z.object({ products: z.array(productSchema), nextCursor: z.string().nullable() }), t("auth.requestFailed")),
    ]);
    setCategories(categoryResult.categories);
    setProducts(productResult.products);
  }, [t]);

  useEffect(() => {
    // Data hydration is the external side effect for this client component.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("auth.requestFailed")));
  }, [load, t]);

  useEffect(() => {
    const previews = images.map((image) => URL.createObjectURL(image));
    // Object URLs are created outside React; keep their lifecycle synchronized with the file list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImagePreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [images]);

  const parentCategories = categories.filter((category) => !category.parentId);
  const subcategories = categories.filter((category) => category.parentId === categoryId);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = !search || `${product.name} ${product.nameSo ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "ALL" || product.status === statusFilter);
  }), [products, search, statusFilter]);

  function categoryLabel(category: Category) {
    return locale === "so" ? `${category.nameSo ?? category.name}` : `${category.name}${category.nameSo ? ` · ${category.nameSo}` : ""}`;
  }

  function resetComposer() {
    setName(""); setNameSo(""); setDescription(""); setDescriptionSo(""); setBrand("");
    setCategoryId(""); setSubcategoryId(""); setVariants([emptyVariant()]); setImages([]);
    setHasOptions(false); setOptions([]); setBasePrice(""); setBaseStockQuantity("0");
  }

  function updateVariant(index: number, field: "variantName" | "sku" | "price" | "stockQuantity", value: string) {
    setVariants((current) => current.map((variant, variantIndex) => variantIndex === index ? { ...variant, [field]: value } : variant));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (images.length < 1 || images.length > 6) {
      setError(t("vendor.imagesHelp"));
      return;
    }
    if (hasOptions && (!variants.length || variants.some((variant) => !variant.sku.trim() || Number(variant.price) <= 0 || Number(variant.stockQuantity) < 0 || !Number.isInteger(Number(variant.stockQuantity))))) {
      setError(t("vendor.variantsHelp"));
      return;
    }
    if (!hasOptions && (Number(basePrice) <= 0 || !Number.isInteger(Number(baseStockQuantity)) || Number(baseStockQuantity) < 0)) {
      setError("Enter a valid base price and non-negative whole-number stock quantity.");
      return;
    }
    const skus = hasOptions ? variants.map((variant) => variant.sku.trim().toLowerCase()) : [];
    if (new Set(skus).size !== skus.length) {
      setError(t("vendor.variantsHelp"));
      return;
    }
    setSaving(true);
    try {
      const createdResult = await requestApi("/api/v1/vendor/products", z.object({ product: productSchema }), t("auth.requestFailed"), postJson({
        name, nameSo, description, descriptionSo, brand,
        categoryId: subcategoryId || categoryId,
        basePrice: hasOptions ? undefined : Number(basePrice),
        baseStockQuantity: hasOptions ? undefined : Number(baseStockQuantity),
        variants: hasOptions ? variants.map((variant) => ({
          variantName: variant.variantName,
          sku: variant.sku.trim(),
          attributes: variant.attributes ?? {},
          price: Number(variant.price),
          stockQuantity: Number(variant.stockQuantity),
          isActive: true,
        })) : [],
      }));
      const created = createdResult.product;
      for (const image of images) {
        const form = new FormData();
        form.set("file", image);
        await requestApi(`/api/v1/vendor/products/${created.id}/images`, z.object({ image: z.object({ id: z.string() }) }), t("auth.requestFailed"), postFormData(form));
      }
      resetComposer();
      setComposerOpen(false);
      setMessage(t("vendor.productSaved"));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: "publish" | "archive") {
    setError(null);
    try {
      await requestApi(`/api/v1/vendor/products/${id}/${status}`, z.object({ product: productSchema }), t("auth.requestFailed"), postJson({}));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">{t("vendor.catalogEyebrow")}</p>
          <h2 className="mt-1 text-3xl font-bold text-[#123b35]">{t("vendor.productsTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("vendor.productsDescription")}</p>
        </div>
        {composerOpen ? (
          <button type="button" onClick={() => { setComposerOpen(false); resetComposer(); }} className="rounded-xl border border-[#d5dfda] px-4 py-2.5 text-sm font-semibold">{t("vendor.cancelProduct")}</button>
        ) : (
          <button type="button" onClick={() => setComposerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c554b]"><Plus className="size-4" /> {t("vendor.addProduct")}</button>
        )}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}

      {composerOpen && (
        <form onSubmit={create} className="relative z-20 mt-6 grid gap-6 overflow-visible rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-[#123b35]">{t("vendor.productInformation")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("vendor.productBilingualHelp")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">{t("vendor.productNameEn")}<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("vendor.productNameSo")}<input required minLength={2} value={nameSo} onChange={(event) => setNameSo(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("vendor.brandOptional")}<input value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
            <label className="relative z-30 grid gap-1 text-sm font-semibold">
              {t("vendor.category")}
              <select required value={categoryId} onChange={(event) => { const selectedId = event.target.value; setCategoryId(selectedId); setSubcategoryId(""); setOptions(categoryOptions(categories, selectedId, selectedId)); setVariants([]); }} className="rounded-xl border border-[#d5dfda] bg-white px-3 py-2.5 font-normal">
                <option value="">{t("vendor.selectCategory")}</option>
                {parentCategories.map((category) => <option key={category.id} value={category.id}>{categoryLabel(category)}</option>)}
              </select>
            </label>
            <label className="relative z-30 grid gap-1 text-sm font-semibold">
              {t("vendor.subcategory")}
              <select value={subcategoryId} onChange={(event) => { const selectedId = event.target.value; setSubcategoryId(selectedId); setOptions(categoryOptions(categories, selectedId, categoryId)); setVariants([]); }} className="rounded-xl border border-[#d5dfda] bg-white px-3 py-2.5 font-normal">
                <option value="">{subcategories.length === 0 ? t("vendor.noSubcategories") : t("vendor.selectSubcategory")}</option>
                {subcategories.map((category) => <option key={category.id} value={category.id}>{categoryLabel(category)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">{t("vendor.descriptionEn")}<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("vendor.descriptionSo")}<textarea value={descriptionSo} onChange={(event) => setDescriptionSo(event.target.value)} rows={3} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{t("vendor.variantsTitle")}</h3>
                <p className="text-sm text-slate-500">Options are optional. Each generated combination has its own SKU, price, and stock.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={hasOptions} onChange={(event) => { setHasOptions(event.target.checked); setVariants([]); }} />
                This product has selectable options
              </label>
            </div>
            {!hasOptions ? (
              <div className="mt-3 grid gap-3 rounded-xl bg-[#f5f8f6] p-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">Base price
                  <input required min="0.01" step="0.01" type="number" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} className="rounded-lg border border-[#d5dfda] px-3 py-2 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">Base stock
                  <input required min="0" step="1" type="number" value={baseStockQuantity} onChange={(event) => setBaseStockQuantity(event.target.value)} className="rounded-lg border border-[#d5dfda] px-3 py-2 font-normal" />
                </label>
                <p className="text-xs text-slate-600 sm:col-span-2">Somsuuq stores this as one standard inventory option so cart, reservation, and stock rules remain consistent.</p>
              </div>
            ) : (
              <>
                <div className="mt-3 grid gap-3">
                  {options.map((option, index) => (
                    <div key={`${option.name}-${index}`} className="grid gap-2 rounded-xl bg-[#f5f8f6] p-3 sm:grid-cols-[1fr_2fr_auto]">
                      <input aria-label="Option name" value={option.name} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Option name (e.g. Size)" className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      <input aria-label={`Values for ${option.name}`} maxLength={1000} value={option.values} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, values: event.target.value } : item))} placeholder={option.suggestedValues.length ? option.suggestedValues.join(", ") : "Comma-separated values"} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      <button type="button" aria-label="Remove option" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setOptions((current) => [...current, { name: "", values: "", suggestedValues: [] }])} className="inline-flex items-center gap-1 text-sm font-semibold text-[#8b5e08]"><Plus className="size-4" /> Add custom option</button>
                  <button type="button" onClick={() => {
                    const combinations = buildVariantCombinations(name, options);
                    if (!combinations.length) {
                      setError("Enter option values to generate between 1 and 100 combinations.");
                      return;
                    }
                    setVariants(combinations);
                    setError(null);
                  }} className="rounded-lg bg-[#123b35] px-3 py-2 text-sm font-semibold text-white">Generate combinations</button>
                </div>
                <div className="mt-3 grid gap-3">
                  {variants.map((variant, index) => (
                    <div key={`${variant.sku}-${index}`} className="grid gap-2 rounded-xl bg-[#f5f8f6] p-3 sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]">
                      <input aria-label={t("vendor.variantName")} value={variant.variantName} onChange={(event) => updateVariant(index, "variantName", event.target.value)} placeholder={t("vendor.variantName")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      <input required aria-label={t("vendor.sku")} value={variant.sku} onChange={(event) => updateVariant(index, "sku", event.target.value)} placeholder={t("vendor.sku")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      <input required min="0.01" step="0.01" type="number" aria-label={t("vendor.price")} value={variant.price} onChange={(event) => updateVariant(index, "price", event.target.value)} placeholder={t("vendor.price")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      <input required min="0" type="number" aria-label={t("vendor.stock")} value={variant.stockQuantity} onChange={(event) => updateVariant(index, "stockQuantity", event.target.value)} placeholder={t("vendor.stock")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm" />
                      {variants.length > 1 && <button type="button" aria-label={t("vendor.removeVariant")} onClick={() => setVariants((current) => current.filter((_, variantIndex) => variantIndex !== index))} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <h3 className="font-bold">{t("vendor.imagesTitle")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("vendor.imagesHelp")}</p>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbd8d2] p-6 text-center hover:border-[#123b35]">
              <Upload className="size-6 text-[#123b35]" />
              <span className="mt-2 text-sm font-semibold">{t("vendor.chooseImages")}</span>
              <input required multiple accept="image/jpeg,image/png,image/webp" type="file" className="sr-only" onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 6))} />
            </label>
            {images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">{imagePreviews.map((preview, index) => <Image key={preview} src={preview} alt={images[index]?.name ?? ""} width={120} height={120} unoptimized className="aspect-square rounded-lg object-cover" />)}</div>}
          </div>
          <button disabled={saving} type="submit" className="rounded-xl bg-[#f4b942] px-4 py-3 font-bold text-[#123b35] disabled:cursor-not-allowed disabled:opacity-60">{saving ? t("vendor.saving") : t("vendor.saveDraft")}</button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{t("vendor.yourCatalog")}</h3>
        <div className="flex gap-2">
          <label className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("vendor.searchProducts")} className="rounded-xl border border-[#d5dfda] py-2 ps-9 pe-3 text-sm" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 text-sm">
            <option value="ALL">{t("vendor.allStatuses")}</option>
            <option value="DRAFT">{t("vendor.drafts")}</option>
            <option value="PUBLISHED">{t("vendor.published")}</option>
            <option value="ARCHIVED">{t("vendor.archived")}</option>
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {visibleProducts.map((product) => (
          <article key={product.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e1e9e5] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {product.images[0] ? <Image src={`/api/v1/products/images/${product.images[0].id}`} alt="" width={64} height={64} unoptimized className="size-16 rounded-lg object-cover" /> : <div className="grid size-16 place-items-center rounded-lg bg-[#f5f8f6] text-xs text-slate-500">{t("vendor.noImage")}</div>}
              <div>
                <h4 className="font-semibold text-[#123b35]">{locale === "so" ? product.nameSo || product.name : product.name}</h4>
                <p className="text-sm text-slate-500">{product.category.name} · {product.variants.length} · {product.variants.reduce((total, variant) => total + variant.stockQuantity, 0)} {t("vendor.inStock")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-semibold">{product.status}</span>
              {product.status === "DRAFT" && <button type="button" onClick={() => void changeStatus(product.id, "publish")} className="rounded-lg bg-[#f4b942] px-3 py-2 text-sm font-semibold text-[#123b35]">{t("vendor.publish")}</button>}
              {product.status !== "ARCHIVED" && <button type="button" onClick={() => void changeStatus(product.id, "archive")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold text-[#123b35]">{t("vendor.archive")}</button>}
            </div>
          </article>
        ))}
        {visibleProducts.length === 0 && <p className="rounded-xl bg-white p-6 text-sm text-slate-600">{t("vendor.noMatchingProducts")}</p>}
      </div>
    </section>
  );
}
