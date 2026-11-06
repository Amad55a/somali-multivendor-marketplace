"use client";

import { useState } from "react";
import { postJson, requestApi } from "@/lib/api/client";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";

type Variant = {
  id: string;
  sku: string;
  variantName: string;
  stockQuantity: number;
  updatedAt: string;
  product: { id: string; name: string };
};

export function VendorInventoryTable({ variants }: Readonly<{ variants: Variant[] }>) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(variants);
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [search, setSearch] = useState("");

  async function save(id: string, stockQuantity: number) {
    await requestApi(`/api/v1/vendor/inventory/${id}`, z.object({ updated: z.literal(true), stockQuantity: z.number() }), t("auth.requestFailed"), postJson({ stockQuantity }));
    setRows((current) => current.map((row) => (row.id === id ? { ...row, stockQuantity } : row)));
  }

  const visible = rows.filter((row) => {
    if (filter === "low" && !(row.stockQuantity > 0 && row.stockQuantity <= 5)) return false;
    if (filter === "out" && row.stockQuantity !== 0) return false;
    if (search && !`${row.product.name} ${row.sku} ${row.variantName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <section>
      <h2 className="text-3xl font-bold">{t("vendor.inventoryTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("vendor.inventoryDescription")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("vendor.searchPlaceholder")} className="rounded-xl border px-3 py-2" />
        <button type="button" onClick={() => setFilter("all")} className="rounded-xl border px-3 py-2 text-sm font-semibold">All</button>
        <button type="button" onClick={() => setFilter("low")} className="rounded-xl border px-3 py-2 text-sm font-semibold">{t("vendor.stockLow")}</button>
        <button type="button" onClick={() => setFilter("out")} className="rounded-xl border px-3 py-2 text-sm font-semibold">{t("vendor.stockOut")}</button>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-[#e1e9e5] bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[#e1e9e5] bg-[#f5f8f6]">
            <tr>
              <th className="p-4">{t("vendor.product")}</th>
              <th className="p-4">{t("vendor.variant")}</th>
              <th className="p-4">{t("vendor.sku")}</th>
              <th className="p-4">{t("vendor.available")}</th>
              <th className="p-4">{t("vendor.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {visible.map((variant) => (
              <tr key={variant.id}>
                <td className="p-4 font-semibold">{variant.product.name}</td>
                <td className="p-4">{variant.variantName}</td>
                <td className="p-4 font-mono text-xs">{variant.sku}</td>
                <td className="p-4">
                  <input type="number" min={0} defaultValue={variant.stockQuantity} onBlur={(event) => void save(variant.id, Number(event.target.value))} className="w-24 rounded-lg border px-2 py-1" />
                </td>
                <td className="p-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${variant.stockQuantity === 0 ? "bg-red-50 text-red-700" : variant.stockQuantity <= 5 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {variant.stockQuantity === 0 ? t("vendor.stockOut") : variant.stockQuantity <= 5 ? t("vendor.stockLow") : t("vendor.stockOk")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-sm text-slate-600">{t("vendor.noInventory")}</p>}
      </div>
    </section>
  );
}
