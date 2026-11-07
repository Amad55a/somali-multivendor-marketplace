"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";

type CouponMode = "vendor" | "admin";

type CouponRecord = {
  id?: string;
  code?: string;
  scope?: string;
  discountType?: string;
  discountValue?: string | number;
  minOrderAmount?: string | number;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  usageCount?: number;
  remainingUses?: number | null;
  fundedAmount?: string | number;
};

const emptyForm = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: "10",
  minOrderAmount: "20",
  totalUsageLimit: "100",
  perCustomerLimit: "1",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

const responseSchema = z.object({ coupon: z.any().optional() }).passthrough();
const listSchema = z.object({ coupons: z.array(z.any()) }).passthrough();

function formatAmount(value: string | number | undefined | null) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function fetchCoupons(mode: CouponMode) {
  return requestApi(
    mode === "vendor" ? "/api/v1/vendor/coupons" : "/api/v1/admin/coupons",
    listSchema,
    "Could not load coupons.",
  ).then((data) => (Array.isArray(data.coupons) ? data.coupons : []));
}

export function CouponManager({ mode }: { mode: CouponMode }) {
  return <CouponManagerContent key={mode} mode={mode} />;
}

function CouponManagerContent({ mode }: { mode: CouponMode }) {
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const requestSequence = useRef(0);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    const requestId = ++requestSequence.current;
    let active = true;
    void fetchCoupons(mode)
      .then((loadedCoupons) => {
        if (active && requestId === requestSequence.current) {
          setCoupons(loadedCoupons);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active && requestId === requestSequence.current) {
          setError(loadError instanceof Error ? loadError.message : "Could not load coupons.");
        }
      })
      .finally(() => {
        if (active && requestId === requestSequence.current) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
      isMounted.current = false;
      requestSequence.current += 1;
    };
  }, [mode]);

  async function reloadCoupons() {
    const requestId = ++requestSequence.current;
    try {
      const loadedCoupons = await fetchCoupons(mode);
      if (isMounted.current && requestId === requestSequence.current) {
        setCoupons(loadedCoupons);
        setError(null);
      }
    } catch (loadError) {
      if (isMounted.current && requestId === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load coupons.");
      }
    } finally {
      if (isMounted.current && requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }

  const updateField = (field: keyof typeof emptyForm) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const nextValue = event.target instanceof HTMLInputElement && event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const rawCode = form.code.trim();
      const startDate = form.startsAt ? new Date(form.startsAt) : null;
      const endDate = form.endsAt ? new Date(form.endsAt) : null;

      if (!rawCode || rawCode.length < 3 || rawCode.length > 40) {
        throw new Error("Coupon code must be between 3 and 40 characters.");
      }
      if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
        throw new Error("Coupon start date must be before the end date.");
      }

      const discountValue = Number(form.discountValue);
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new Error("Discount value must be greater than zero.");
      }

      const payload = {
        code: rawCode.toUpperCase(),
        scope: mode === "vendor" ? "VENDOR" : "PLATFORM",
        discountType: form.discountType,
        discountValue,
        minOrderAmount: Number(form.minOrderAmount || 0),
        totalUsageLimit: form.totalUsageLimit ? Number(form.totalUsageLimit) : undefined,
        perCustomerLimit: Number(form.perCustomerLimit || 1),
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        isActive: form.isActive,
      };

      const result = await requestApi(
        "/api/v1/coupons",
        responseSchema,
        "Coupon could not be saved.",
        {
          ...postJson(payload),
        },
      );

      setMessage(result.coupon ? "Coupon saved successfully." : "Coupon saved successfully.");
      setForm({ ...emptyForm, startsAt: "", endsAt: "" });
      setLoading(true);
      setError(null);
      await reloadCoupons();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Coupon could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">Marketplace</p>
          <h2 className="mt-1 text-3xl font-bold text-[#123b35]">{mode === "vendor" ? "Vendor coupons" : "Platform coupons"}</h2>
        </div>
        <span className="rounded-full bg-[#e6f4ed] px-3 py-1 text-xs font-semibold text-[#176044]">
          {mode === "vendor" ? "Store-owned" : "Platform-wide"}
        </span>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,0.85fr)]">
        <form onSubmit={handleSubmit} className="min-w-0 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-[#123b35]">Create coupon</h3>
          <div className="mt-5 grid gap-4 text-sm">
            <label className="grid gap-1">
              <span className="font-medium text-slate-700">Coupon code</span>
              <input value={form.code} onChange={updateField("code")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" placeholder="EID10" required />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Discount type</span>
                <select value={form.discountType} onChange={updateField("discountType")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15">
                  <option value="PERCENTAGE">PERCENTAGE</option>
                  <option value="FIXED">FIXED</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Discount value</span>
                <input type="number" min="0" step="0.01" value={form.discountValue} onChange={updateField("discountValue")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" required />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Minimum order</span>
                <input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={updateField("minOrderAmount")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" required />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Total usage limit</span>
                <input type="number" min="1" step="1" value={form.totalUsageLimit} onChange={updateField("totalUsageLimit")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Per customer limit</span>
                <input type="number" min="1" step="1" value={form.perCustomerLimit} onChange={updateField("perCustomerLimit")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" required />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Status</span>
                <select value={String(form.isActive)} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "true" }))} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Starts at</span>
                <input type="datetime-local" value={form.startsAt} onChange={updateField("startsAt")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" required />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-700">Ends at</span>
                <input type="datetime-local" value={form.endsAt} onChange={updateField("endsAt")} className="min-h-11 rounded-xl border border-[#dce4e1] bg-[#f8faf9] px-3 outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15" required />
              </label>
            </div>
          </div>

          <button type="submit" disabled={saving} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#123b35] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70">
            {saving ? "Saving..." : "Save coupon"}
          </button>
        </form>

        <div className="min-w-0 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[#123b35]">Coupon list</h3>
            <span className="rounded-full bg-[#f7f3e7] px-2.5 py-1 text-xs font-semibold text-[#8b5e08]">{coupons.length} active</span>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-slate-600">Loading coupons…</p>
          ) : coupons.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">No coupons created yet.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#edf1ef] text-slate-600">
                  <tr>
                    <th className="pb-3 pr-3 font-semibold">Code</th>
                    <th className="pb-3 pr-3 font-semibold">Type</th>
                    <th className="pb-3 pr-3 font-semibold">Status</th>
                    <th className="pb-3 pr-3 font-semibold">Uses</th>
                    <th className="pb-3 pr-3 font-semibold">Funded</th>
                    <th className="pb-3 font-semibold">Validity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {coupons.map((coupon) => (
                    <tr key={coupon.id ?? coupon.code ?? `${coupon.discountType}-${coupon.startsAt}`} className="align-top">
                      <td className="py-3 pr-3 font-semibold text-[#123b35]">{coupon.code ?? "—"}</td>
                      <td className="py-3 pr-3 text-slate-600">
                        {coupon.discountType ?? "PERCENTAGE"} · {coupon.discountValue ?? 0}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${coupon.isActive ? "bg-[#e6f4ed] text-[#176044]" : "bg-[#f3e2e2] text-[#8f3a3a]"}`}>
                          {coupon.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {coupon.usageCount ?? 0}
                        {coupon.remainingUses !== null && coupon.remainingUses !== undefined ? ` / ${coupon.remainingUses}` : ""}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{formatAmount(coupon.fundedAmount)}</td>
                      <td className="py-3 text-slate-600">
                        <div>{formatDate(coupon.startsAt)}</div>
                        <div className="text-xs text-slate-500">to {formatDate(coupon.endsAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
