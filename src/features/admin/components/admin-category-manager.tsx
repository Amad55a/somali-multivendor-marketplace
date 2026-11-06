"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameSo: z.string().nullable(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean(),
});

export function AdminCategoryManager() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<z.infer<typeof categorySchema>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", nameSo: "", parentId: "", isActive: true });

  useEffect(() => {
    requestApi("/api/v1/admin/categories", z.object({ categories: z.array(categorySchema) }), t("auth.requestFailed"))
      .then((result) => setCategories(result.categories))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("auth.requestFailed")));
  }, [t]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await requestApi(
        "/api/v1/admin/categories",
        z.object({ category: categorySchema }),
        t("auth.requestFailed"),
        postJson({ name: form.name, nameSo: form.nameSo, parentId: form.parentId || null, isActive: form.isActive }),
      );
      setForm({ name: "", nameSo: "", parentId: "", isActive: true });
      const result = await requestApi("/api/v1/admin/categories", z.object({ categories: z.array(categorySchema) }), t("auth.requestFailed"));
      setCategories(result.categories);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  async function toggle(id: string, isActive: boolean) {
    await requestApi(
      `/api/v1/admin/categories/${id}`,
      z.object({ category: categorySchema }),
      t("auth.requestFailed"),
      { method: "PATCH", body: JSON.stringify({ isActive }) },
    );
    const result = await requestApi("/api/v1/admin/categories", z.object({ categories: z.array(categorySchema) }), t("auth.requestFailed"));
    setCategories(result.categories);
  }

  const parents = categories.filter((item) => !item.parentId);

  return (
    <section>
      <h2 className="text-3xl font-bold">{t("admin.navigation.categories")}</h2>
      <p className="mt-2 text-sm text-slate-600">Marketplace categories are admin-managed. Vendors select these when creating products.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <form onSubmit={create} className="mt-6 grid gap-3 rounded-2xl border border-[#e1e9e5] bg-white p-5 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">English name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="rounded-xl border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Somali name<input required value={form.nameSo} onChange={(event) => setForm((current) => ({ ...current, nameSo: event.target.value }))} className="rounded-xl border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Parent
          <select value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))} className="rounded-xl border px-3 py-2 font-normal">
            <option value="">None</option>
            {parents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="self-end rounded-xl bg-[#123b35] px-4 py-2 font-semibold text-white">Create category</button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-[#e1e9e5] bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#f5f8f6]"><tr><th className="p-4">English</th><th className="p-4">Somali</th><th className="p-4">Slug</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead>
          <tbody>
            {categories.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-4 font-semibold">{item.name}</td>
                <td className="p-4">{item.nameSo}</td>
                <td className="p-4 font-mono text-xs">{item.slug}</td>
                <td className="p-4">{item.isActive ? "Active" : "Disabled"}</td>
                <td className="p-4">
                  <button type="button" onClick={() => void toggle(item.id, !item.isActive)} className="text-sm font-semibold text-[#8b5e08]">
                    {item.isActive ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
