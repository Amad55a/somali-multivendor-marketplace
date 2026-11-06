"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";

const settingsSchema = z.object({
  defaultPercent: z.string(),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    nameSo: z.string().nullable(),
    parentId: z.string().nullable(),
    isActive: z.boolean(),
    configuredPercent: z.string().nullable(),
    ruleActive: z.boolean(),
    effectivePercent: z.string(),
    inheritedFrom: z.string(),
  })),
  history: z.array(z.object({
    id: z.string(),
    categoryName: z.string(),
    previousPercent: z.string().nullable(),
    percent: z.string(),
    isActive: z.boolean(),
    changedBy: z.string(),
    createdAt: z.string(),
  })),
});

type Settings = z.infer<typeof settingsSchema>;

export function AdminCommissionManager() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaultPercent, setDefaultPercent] = useState("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestApi("/api/v1/admin/commission-settings", settingsSchema, t("finance.requestFailed"))
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setDefaultPercent(result.defaultPercent);
        setRates(Object.fromEntries(result.categories.map((category) => [
          category.id,
          category.configuredPercent ?? category.effectivePercent,
        ])));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const effectiveRates = useMemo(() => {
    if (!settings) return new Map<string, string>();
    const categories = new Map(settings.categories.map((category) => [category.id, category]));
    const result = new Map<string, string>();
    for (const category of settings.categories) {
      let current: Settings["categories"][number] | undefined = category;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.ruleActive) {
          result.set(category.id, rates[current.id] ?? current.configuredPercent ?? current.effectivePercent);
          current = undefined;
          break;
        }
        current = current.parentId ? categories.get(current.parentId) : undefined;
      }
      if (!result.has(category.id)) result.set(category.id, defaultPercent || settings.defaultPercent);
    }
    return result;
  }, [defaultPercent, rates, settings]);

  async function reload() {
    const result = await requestApi("/api/v1/admin/commission-settings", settingsSchema, t("finance.requestFailed"));
    setSettings(result);
    setDefaultPercent(result.defaultPercent);
    setRates(Object.fromEntries(result.categories.map((category) => [
      category.id,
      category.configuredPercent ?? category.effectivePercent,
    ])));
  }

  async function saveDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        "/api/v1/admin/commission-settings",
        z.object({ settings: z.unknown() }),
        t("finance.requestFailed"),
        postJson({ percent: Number(defaultPercent) }),
      );
      await reload();
      setNotice(t("finance.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(categoryId: string, isActive: boolean) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        "/api/v1/admin/commissions",
        z.object({ commission: z.unknown() }),
        t("finance.requestFailed"),
        postJson({ categoryId, percent: Number(rates[categoryId]), isActive }),
      );
      await reload();
      setNotice(t("finance.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("finance.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-[#123b35]">{t("finance.commissionTitle")}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t("finance.commissionDescription")}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

      <form onSubmit={saveDefault} className="flex flex-wrap items-end gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <label className="grid gap-1 text-sm font-semibold">
          {t("finance.defaultCommission")}
          <span className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={defaultPercent}
              onChange={(event) => setDefaultPercent(event.target.value)}
              className="min-h-11 w-36 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3"
            />
            <span>%</span>
          </span>
        </label>
        <button disabled={saving || loading} className="min-h-11 rounded-xl bg-[#123b35] px-5 text-sm font-semibold text-white disabled:opacity-60">
          {t("finance.saveCommission")}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-600">{t("finance.loading")}</p>
      ) : settings && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[#e1e9e5] bg-white shadow-sm">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-[#f5f8f6] text-slate-600">
                <tr>
                  <th className="p-4">{t("finance.category")}</th>
                  <th className="p-4">{t("finance.configuredRate")}</th>
                  <th className="p-4">{t("finance.effectiveRate")}</th>
                  <th className="p-4">{t("finance.inheritedFrom")}</th>
                  <th className="p-4">{t("finance.payoutStatus")}</th>
                  <th className="p-4">{t("finance.saveCommission")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {settings.categories.map((category) => (
                  <tr key={category.id}>
                    <td className="p-4 font-semibold">
                      {category.parentId ? <span className="me-2 text-slate-400">↳</span> : null}
                      {category.name}
                    </td>
                    <td className="p-4">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={rates[category.id] ?? ""}
                        onChange={(event) => setRates((current) => ({ ...current, [category.id]: event.target.value }))}
                        aria-label={`${t("finance.configuredRate")}: ${category.name}`}
                        className="min-h-10 w-28 rounded-lg border border-[#dce4e1] px-3"
                      />
                      <span className="ms-2">%</span>
                    </td>
                    <td className="p-4 font-semibold text-[#123b35]">{effectiveRates.get(category.id)}%</td>
                    <td className="p-4 text-slate-600">{category.inheritedFrom}</td>
                    <td className="p-4">{category.ruleActive ? t("finance.active") : t("finance.inactive")}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving || !Number.isFinite(Number(rates[category.id])) || Number(rates[category.id]) < 0 || Number(rates[category.id]) > 100}
                          onClick={() => void saveCategory(category.id, category.ruleActive)}
                          className="rounded-lg bg-[#123b35] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {t("finance.saveCommission")}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveCategory(category.id, !category.ruleActive)}
                          className="rounded-lg border border-[#dce4e1] px-3 py-2 text-xs font-semibold"
                        >
                          {category.ruleActive ? t("finance.deactivate") : t("finance.activate")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[#123b35]">{t("finance.commissionHistory")}</h3>
            <div className="mt-4 space-y-3">
              {settings.history.map((entry) => (
                <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-t border-[#edf1ef] pt-3 text-sm">
                  <span className="font-semibold">{entry.categoryName}: {entry.previousPercent ?? "—"}% → {entry.percent}%</span>
                  <span className="text-slate-600">{t("finance.changedBy")} {entry.changedBy} · {new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {settings.history.length === 0 && <p className="text-sm text-slate-600">{t("finance.noStatementEntries")}</p>}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
