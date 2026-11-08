"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";

type Category = {
  id: string;
  name: string;
  nameSo: string | null;
  description: string | null;
  descriptionSo: string | null;
  parentId: string | null;
};

export function VendorCategoryList({
  categories,
  locale,
}: Readonly<{ categories: Category[]; locale: Locale }>) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const parents = categories.filter((category) => !category.parentId);
  const childrenOf = (parentId: string) => categories.filter((category) => category.parentId === parentId);
  const label = (category: Category) => (locale === "so" ? category.nameSo || category.name : category.name);

  return (
    <section>
      <h2 className="text-3xl font-bold">{t("vendor.categoriesTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("vendor.categoriesDescription")}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {parents.map((category) => {
          const children = childrenOf(category.id);
          const open = openId === category.id;
          return (
            <article key={category.id} className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
              <h3 className="font-bold">{label(category)}</h3>
              <p className="mt-2 text-sm text-slate-600">{(locale === "so" ? category.descriptionSo : category.description) ?? t("vendor.marketplaceCategory")}</p>
              {children.length > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : category.id)}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#8b5e08]"
                >
                  {open ? t("vendor.hideSubcategories") : t("vendor.openSubcategories")}
                  <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
                </button>
              )}
              {open && (
                <ul className="mt-3 grid gap-2">
                  {children.map((child) => (
                    <li key={child.id} className="rounded-lg bg-[#f5f8f6] px-3 py-2 text-sm">
                      {label(child)}
                    </li>
                  ))}
                </ul>
              )}
              <a href={`/${locale}/vendor/products`} className="mt-4 inline-block text-sm font-semibold text-[#8b5e08] hover:underline">
                {t("vendor.useCategory")}
              </a>
            </article>
          );
        })}
        {parents.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-slate-600">{t("vendor.noCategories")}</p>}
      </div>
    </section>
  );
}
