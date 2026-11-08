"use client";

import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { cartSchema, fetchCart } from "@/features/commerce/cart-api";
import { postJson, requestApi } from "@/lib/api/client";
import { getRecaptchaToken } from "@/lib/recaptcha/client";
import { countries, findCountry, findRegion, normalizePhone } from "@/features/vendors/data/location-data";
import { z } from "zod";

const reserveSchema = z.object({
  reservationId: z.string(),
  expiresAt: z.string(),
  serverNow: z.string(),
  secondsRemaining: z.number(),
  total: z.string(),
  currency: z.string(),
  groups: z.array(z.object({
    vendorId: z.string(),
    storeName: z.string().nullable(),
    deliveryFee: z.string(),
    subtotal: z.string(),
    total: z.string(),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      nameSo: z.string().nullable(),
      imageId: z.string().nullable(),
      variantName: z.string(),
      quantity: z.number(),
      price: z.string(),
      lineTotal: z.string(),
    })),
  })),
});
const quoteSchema = z.object({ total: z.string(), currency: z.string() });
const paymentResultSchema = z.object({
  payment: z.object({
    id: z.string(),
    status: z.enum(["PENDING", "SIMULATED_SUCCESS", "FAILED", "CANCELLED", "EXPIRED"]),
    method: z.string().nullable().optional(),
    amount: z.string(),
    currency: z.string(),
    transactionReference: z.string().nullable().optional(),
    simulated: z.boolean(),
    failureReason: z.string().nullable().optional(),
  }),
  order: z.object({ id: z.string(), orderNumber: z.string(), total: z.string(), simulated: z.boolean() }).nullable(),
  receipt: z.object({ id: z.string(), receiptNumber: z.string() }).nullable(),
  message: z.string().optional(),
});
const cancelResultSchema = z.object({ payment: z.object({ status: z.string() }) });
const customerProfileSchema = z.object({ profile: z.object({ email: z.string(), displayName: z.string().nullable() }) }).passthrough();
const paymentMethods = [
  { value: "EVC_PLUS", name: "EVC Plus", operator: "Hormuud", logo: "/images/payment-methods/hormuud.png" },
  { value: "ZAAD", name: "Zaad", operator: "Telesom", logo: "/images/payment-methods/telesom-favicon.png" },
  { value: "EDAHAB", name: "eDahab", operator: "Somtel", logo: "/images/payment-methods/somtel.png" },
] as const;

export function CheckoutPage({ locale, customerName, customerEmail }: Readonly<{ locale: Locale; customerName: string | null; customerEmail: string }>) {
  const { t } = useTranslation();
  const [total, setTotal] = useState("0.00");
  const [cart, setCart] = useState<z.infer<typeof cartSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [reservation, setReservation] = useState<z.infer<typeof reserveSchema> | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [serverClockOffset, setServerClockOffset] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [vendorCoupons, setVendorCoupons] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ contactName: customerName ?? "", checkoutPhone: "", country: "Somalia", region: "", city: "", district: "", address: "", instructions: "", method: "EVC_PLUS", phone: "", platformCoupon: "" });

  useLayoutEffect(() => {
    if (!orderNumber) return;
    return () => {
      setOrderNumber(null);
      setOrderId(null);
      setReservation(null);
      setRemaining(0);
    };
  }, [orderNumber]);

  useEffect(() => {
    fetchCart()
      .then(({ cart: result }) => {
        setCart(result);
        setTotal(result.total ?? result.subtotal);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("auth.requestFailed")));
    void requestApi("/api/v1/customer/profile", customerProfileSchema, t("auth.requestFailed"))
      .then(({ profile }) => setForm((current) => ({ ...current, contactName: current.contactName || profile.displayName || "" })))
      .catch((reason: unknown) => console.error("[checkout] Could not prefill customer name", reason));
  }, [t]);

  useEffect(() => {
    if (!reservation) return;
    const updateRemaining = () => {
      setRemaining(Math.max(0, Math.ceil((Date.parse(reservation.expiresAt) - (Date.now() + serverClockOffset)) / 1000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [reservation, serverClockOffset]);

  useEffect(() => {
    if (!reservation) return;
    const coupon = form.platformCoupon.trim();
    const activeVendorCoupons = Object.fromEntries(
      Object.entries(vendorCoupons)
        .map(([vendorId, code]) => [vendorId, code.trim()])
        .filter(([, code]) => Boolean(code)),
    );
    if (!coupon && Object.keys(activeVendorCoupons).length === 0) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void requestApi(
        "/api/v1/checkout/quote",
        quoteSchema,
        t("auth.requestFailed"),
        postJson({
          reservationId: reservation.reservationId,
          ...(coupon ? { platformCoupon: coupon } : {}),
          ...(Object.keys(activeVendorCoupons).length ? { vendorCoupons: activeVendorCoupons } : {}),
        }),
      )
        .then((result) => {
          if (active) {
            setTotal(result.total);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
        })
        .finally(() => {
          if (active) setQuoting(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.platformCoupon, reservation, t, vendorCoupons]);

  async function reserve() {
    setError(null);
    try {
      const result = await requestApi("/api/v1/checkout/reserve", reserveSchema, t("auth.requestFailed"), postJson({}));
      setReservation(result);
      setServerClockOffset(Date.parse(result.serverNow) - Date.now());
      setRemaining(result.secondsRemaining);
      setTotal(result.total);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("auth.requestFailed");
      try {
        const latest = await fetchCart();
        setCart(latest.cart);
        setTotal(latest.cart.total ?? latest.cart.subtotal);
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error ? refreshError.message : t("auth.requestFailed");
        setError(`${message} ${refreshMessage}`);
        return;
      }
      setError(message);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation) {
      await reserve();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recaptchaToken = await getRecaptchaToken("checkout_simulate");
      const result = await requestApi("/api/v1/checkout/pay", paymentResultSchema, t("auth.requestFailed"), postJson({
        ...form,
        phone: normalizePhone(form.country, form.phone),
        checkoutPhone: normalizePhone(form.country, form.checkoutPhone),
        vendorCoupons: Object.fromEntries(
          Object.entries(vendorCoupons)
            .map(([vendorId, code]) => [vendorId, code.trim()])
            .filter(([, code]) => Boolean(code)),
        ),
        reservationId: reservation.reservationId,
        idempotencyKey: crypto.randomUUID(),
        recaptchaToken,
      }));
      if (result.order) {
        setOrderNumber(result.order.orderNumber);
        setOrderId(result.order.id);
      } else {
        setError(result.message ?? "Simulated payment failed. No money was transferred. You may retry.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function cancelPayment() {
    if (!reservation) return;
    setSaving(true);
    setError(null);
    try {
      await requestApi("/api/v1/checkout/cancel", cancelResultSchema, t("auth.requestFailed"), postJson({
        reservationId: reservation.reservationId,
        method: form.method,
        idempotencyKey: crypto.randomUUID(),
      }));
      setReservation(null);
      setRemaining(0);
      setError("Checkout cancelled. Your stock reservation has been released.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  const selectedCountry = findCountry(form.country) ?? countries[0]!;
  const selectedRegion = findRegion(form.country, form.region);
  const regionOptions = selectedCountry.regions.map(({ name }) => name);
  const cityOptions = selectedRegion ? Object.keys(selectedRegion.cities) : [];
  const districtOptions = selectedRegion?.districts?.[form.city] ?? [];
  const itemCount = cart?.itemCount ?? 0;
  const cartDiscount = Math.max(0, Number(cart?.subtotal ?? 0) + Number(cart?.deliveryTotal ?? 0) - Number(total));
  const orderGroups = reservation?.groups ?? cart?.groups ?? [];

  if (orderNumber) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-[#123b35]">{t("shop.orderConfirmed")}</h1>
        <p className="mt-4 text-slate-600">{t("shop.simulatedPayment")} · SIMULATED PAYMENT / NO REAL MONEY TRANSFERRED</p>
        <p className="mt-2 font-mono text-lg font-bold">{orderNumber}</p>
        <Link href={`/${locale}/customer/orders`} className="mt-6 inline-block rounded-xl bg-[#123b35] px-4 py-3 font-semibold text-white">{t("shop.myOrders")}</Link>
        {orderId && <Link href={`/${locale}/customer/orders/${orderId}/receipt`} className="ms-3 mt-6 inline-block font-semibold text-[#8b5e08]">View payment receipt</Link>}
        <Link href={`/${locale}/customer/payments`} className="ms-3 mt-6 inline-block font-semibold text-[#8b5e08]">Payment history</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <h1 className="text-3xl font-bold text-[#123b35]">{t("shop.checkoutTitle")}</h1>
      <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("shop.simulatedPayment")} EVC Plus, Zaad, and eDahab are test options only. No real money is transferred; do not enter a PIN or OTP.</p>
      {reservation && <p className="mt-4 rounded-xl bg-[#123b35] p-3 text-sm text-white">Checkout reference {reservation.reservationId.slice(0, 8).toUpperCase()} · stock reserved for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} · expires {new Date(reservation.expiresAt).toLocaleTimeString(locale)}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <form onSubmit={submit} className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:gap-8">
        <div className="grid gap-5">
          <section className="grid gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-[#123b35]">Customer information</h2>
            <label className="grid gap-1 text-sm font-semibold">Full name
              <input required minLength={2} maxLength={160} value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Email address
              <input type="email" readOnly value={customerEmail} className="min-h-11 rounded-xl border border-[#d5dfda] bg-slate-50 px-3 font-normal text-slate-600" />
            </label>
            <div className="grid gap-1 text-sm font-semibold">Delivery phone
              <div className="flex items-center rounded-xl border border-[#d5dfda] px-3">
                <span className="pe-2 text-slate-500">{selectedCountry.callingCode}</span>
                <input required inputMode="tel" autoComplete="tel-national" minLength={5} maxLength={24} value={form.checkoutPhone} onChange={(event) => setForm((current) => ({ ...current, checkoutPhone: event.target.value }))} className="min-h-11 w-full font-normal outline-none" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-[#123b35]">Delivery address</h2>
            <label className="grid gap-1 text-sm font-semibold">Country
              <select required value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value, region: "", city: "", district: "" }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal">
                {countries.map((country) => <option key={country.code} value={country.name}>{country.flag} {country.name} ({country.callingCode})</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Region / state
                <input required list="checkout-regions" value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value, city: "", district: "" }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
                <datalist id="checkout-regions">{regionOptions.map((name) => <option key={name} value={name} />)}</datalist>
              </label>
              <label className="grid gap-1 text-sm font-semibold">City
                <input required list="checkout-cities" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value, district: "" }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
                <datalist id="checkout-cities">{cityOptions.map((name) => <option key={name} value={name} />)}</datalist>
              </label>
            </div>
            {districtOptions.length > 0 && <label className="grid gap-1 text-sm font-semibold">District
              <input list="checkout-districts" value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
              <datalist id="checkout-districts">{districtOptions.map((name) => <option key={name} value={name} />)}</datalist>
            </label>}
            <label className="grid gap-1 text-sm font-semibold">Street address
              <input required minLength={3} maxLength={300} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Delivery instructions (optional)
              <textarea maxLength={1000} value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} className="min-h-20 rounded-xl border border-[#d5dfda] px-3 py-2 font-normal" />
            </label>
          </section>

          <section className="grid gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-[#123b35]">Mobile money</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {paymentMethods.map(({ value, name, operator, logo }) => (
                <label key={value} className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border p-3 pe-4 transition-colors ${form.method === value ? "border-[#123b35] bg-[#f5f8f6] text-[#123b35] ring-1 ring-[#123b35]" : "border-[#d5dfda] hover:border-[#9aafa7]"}`}>
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-100 bg-white p-1">
                    <Image src={logo} alt={`${operator} logo`} width={56} height={56} className="max-h-12 max-w-12 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name}</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">{operator}</span>
                  </span>
                  <input type="radio" name="payment-method" value={value} checked={form.method === value} onChange={() => setForm((current) => ({ ...current, method: value }))} aria-label={`${name} by ${operator}`} className="size-4 shrink-0 accent-[#123b35]" />
                </label>
              ))}
            </div>
            <label className="grid gap-1 text-sm font-semibold">Mobile-money number ({selectedCountry.callingCode})
              <input required inputMode="tel" autoComplete="tel-national" minLength={5} maxLength={24} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
            </label>
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Never enter your wallet PIN or OTP. Valid test numbers ending in 0000 fail; other valid test numbers succeed. This is a mock test rule, not provider behavior.</p>
            <label className="grid gap-1 text-sm font-semibold">Platform coupon (optional)
              <input value={form.platformCoupon} onChange={(event) => {
                const platformCoupon = event.target.value;
                setForm((current) => ({ ...current, platformCoupon }));
                const hasVendorCoupon = Object.values(vendorCoupons).some((code) => code.trim());
                setQuoting(Boolean(reservation && (platformCoupon.trim() || hasVendorCoupon)));
                if (!platformCoupon.trim() && !hasVendorCoupon && reservation) {
                  setTotal(reservation.total);
                  setError(null);
                }
              }} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
            </label>
          </section>
          {reservation && remaining === 0 && <p role="status" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">This reservation has expired. Reserve stock again to continue.</p>}
          <button disabled={saving || quoting || !cart || cart.hasUnavailable || Boolean(reservation && remaining === 0)} className="min-h-12 rounded-xl bg-[#f4b942] px-4 py-3 font-bold text-[#123b35] disabled:cursor-not-allowed disabled:opacity-50">{saving ? t("vendor.submitting") : reservation ? remaining === 0 ? "Reservation expired" : "Confirm simulated payment" : "Reserve stock for 10 minutes"}</button>
          {reservation && remaining === 0 && <button type="button" disabled={saving} onClick={() => { setReservation(null); setRemaining(0); void reserve(); }} className="min-h-12 rounded-xl border border-[#123b35] px-4 py-3 font-semibold text-[#123b35] disabled:opacity-50">Reserve stock again</button>}
          {reservation && remaining > 0 && <button type="button" disabled={saving} onClick={() => void cancelPayment()} className="min-h-12 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">Cancel payment and release reservation</button>}
        </div>

        <aside aria-label="Order summary" className="order-first rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm lg:sticky lg:top-28 lg:order-last">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#123b35]">Order summary</h2>
            <span className="text-sm text-slate-500">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 grid gap-5">
            {orderGroups.map((group) => (
              <section key={group.vendorId} className="border-b border-[#e1e9e5] pb-4">
                <h3 className="mb-3 text-sm font-bold text-[#123b35]">{group.storeName ?? "Store"}</h3>
                <div className="grid gap-3">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      {item.imageId
                        ? <Image src={`/api/v1/products/images/${item.imageId}`} alt="" width={56} height={56} unoptimized className="size-14 rounded-lg bg-[#f5f8f6] object-cover" />
                        : <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-[#f5f8f6] text-xs text-slate-500">{t("vendor.noImage")}</div>}
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate font-semibold text-[#123b35]">{locale === "so" ? item.nameSo ?? item.name : item.name}</p>
                        <p className="text-xs text-slate-500">{item.variantName} · Qty {item.quantity}</p>
                        <p className="text-xs text-slate-600">${item.price} × {item.quantity}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">${item.lineTotal}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-sm"><span>Vendor subtotal</span><span>${group.subtotal}</span></div>
                <div className="flex justify-between text-sm text-slate-600"><span>Delivery</span><span>${group.deliveryFee}</span></div>
                <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Vendor coupon (optional)
                  <input
                    value={vendorCoupons[group.vendorId] ?? ""}
                    onChange={(event) => {
                      const code = event.target.value;
                      const hasOtherCoupon = Object.entries(vendorCoupons)
                        .some(([vendorId, currentCode]) => vendorId !== group.vendorId && currentCode.trim());
                      setVendorCoupons((current) => ({ ...current, [group.vendorId]: code }));
                      const hasAnyCoupon = Boolean(code.trim() || form.platformCoupon.trim() || hasOtherCoupon);
                      setQuoting(Boolean(reservation && hasAnyCoupon));
                      if (!hasAnyCoupon && reservation) {
                        setTotal(reservation.total);
                        setError(null);
                      }
                    }}
                    className="min-h-10 rounded-xl border border-[#d5dfda] px-3 font-normal"
                  />
                </label>
              </section>
            ))}
          </div>
          {cart?.hasUnavailable && <p role="alert" className="mt-4 text-sm text-red-700">Some items are unavailable. Update your cart before continuing.</p>}
          {cart?.hasPriceChange && <p className="mt-3 text-sm text-amber-800">Some prices changed; totals use current server prices.</p>}
          <div className="mt-4 grid gap-2 text-sm">
            <p className="flex justify-between"><span>Subtotal</span><span>${cart?.subtotal ?? "0.00"}</span></p>
            <p className="flex justify-between"><span>Delivery</span><span>${cart?.deliveryTotal ?? "0.00"}</span></p>
            {cartDiscount > 0 && <p className="flex justify-between text-green-800"><span>Discount</span><span>−${cartDiscount.toFixed(2)}</span></p>}
            <p className="flex justify-between border-t border-[#e1e9e5] pt-3 text-lg font-bold text-[#123b35]"><span>{t("shop.total")}</span><span>{reservation?.currency ?? "USD"} {total}{quoting ? " · updating…" : ""}</span></p>
          </div>
          <section aria-label="Payment summary" className="mt-4 rounded-xl bg-[#f5f8f6] p-3 text-sm">
            <h3 className="font-bold text-[#123b35]">Payment summary</h3>
            <p className="mt-1">Method: {form.method.replace("_", " ")}</p>
            <p>Number: {form.phone ? `•••• ${form.phone.replace(/\D/g, "").slice(-4)}` : "Not entered"}</p>
            <p>Amount: {reservation?.currency ?? "USD"} {total}</p>
          </section>
        </aside>
      </form>
    </main>
  );
}
