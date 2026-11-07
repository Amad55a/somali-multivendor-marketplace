"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";

const suggestionSchema = z.object({
  products: z.array(z.object({
    id: z.string(),
    name: z.string(),
    nameSo: z.string().nullable(),
    category: z.object({ name: z.string(), nameSo: z.string().nullable() }),
  })),
});
const categoriesSchema = z.object({
  categories: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    nameSo: z.string().nullable(),
  })),
});

export function ProductSearch({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<z.infer<typeof suggestionSchema>["products"]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<z.infer<typeof categoriesSchema>["categories"]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([
        requestApi(
          `/api/v1/products?${new URLSearchParams({ search: value, limit: "5" })}`,
          suggestionSchema,
          t("auth.requestFailed"),
        ),
        requestApi("/api/v1/categories", categoriesSchema, t("auth.requestFailed")),
      ])
        .then(([result, categoryResult]) => {
          if (!active) return;
          setSuggestions(result.products);
          setCategorySuggestions(
            categoryResult.categories
              .filter((category) => `${category.name} ${category.nameSo ?? ""}`.toLocaleLowerCase().includes(value.toLocaleLowerCase()))
              .slice(0, 3),
          );
        })
        .catch((error: unknown) => {
          console.error("[marketplace] Product suggestions failed", error);
          if (active) {
            setSuggestions([]);
            setCategorySuggestions([]);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, t]);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!query.trim()) event.preventDefault();
    setOpen(false);
  }

  const formId = `marketplace-search-${locale}`;
  const inputId = `${formId}-input`;

  return (
    <div className="relative min-w-0 flex-1">
      <form id={formId} action={`/${locale}`} role="search" onSubmit={submit} className="relative">
        <label className="sr-only" htmlFor={inputId}>{t("header.searchLabel")}</label>
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="search"
          name="q"
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={`${formId}-suggestions`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={t("header.searchPlaceholder")}
          className="min-h-11 w-full rounded-xl border border-[#dce4e1] bg-[#f8faf9] ps-10 pe-4 text-sm text-[#123b35] outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15"
        />
      </form>
      {open && query.trim().length >= 2 && (suggestions.length > 0 || categorySuggestions.length > 0) && (
        <ul id={`${formId}-suggestions`} role="listbox" aria-label={t("header.searchLabel")} className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-[#dce4e1] bg-white py-1 text-[#123b35] shadow-xl">
          {suggestions.map((product) => (
            <li key={product.id} role="option" aria-selected={false}>
              <Link
                href={`/${locale}/marketplace/${product.id}`}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 hover:bg-[#f5f8f6]"
              >
                <span className="block truncate text-sm font-semibold">
                  {locale === "so" ? product.nameSo || product.name : product.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {locale === "so" ? product.category.nameSo || product.category.name : product.category.name}
                </span>
              </Link>
            </li>
          ))}
          {categorySuggestions.map((category) => (
            <li key={`category-${category.slug}`} role="option" aria-selected={false}>
              <Link
                href={`/${locale}/marketplace?category=${encodeURIComponent(category.slug)}`}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium hover:bg-[#f5f8f6]"
              >
                {locale === "so" ? category.nameSo || category.name : category.name}
              </Link>
            </li>
          ))}
          <li className="border-t border-[#e7ece9]">
            <button type="submit" form={formId} onClick={() => setOpen(false)} className="w-full px-4 py-2 text-start text-xs font-semibold text-[#8b5e08] hover:bg-[#f5f8f6]">
              {t("header.searchButton")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
