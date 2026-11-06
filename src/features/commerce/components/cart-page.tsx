"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { fetchCart, setCartQuantity, type cartSchema } from "@/features/commerce/cart-api";
import { postJson, requestApi } from "@/lib/api/client";
import { z } from "zod";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

export function CartPage({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [cart, setCart] = useState<z.infer<typeof cartSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadCart = useCallback(async () => {
    try {
      const result = await fetchCart();
      setCart(result.cart);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadCart, 30_000);
  if (!cart) return <main className="mx-auto max-w-4xl px-4 py-12">{error ?? t("header.searchLoading")}</main>;
  const groups = cart.groups?.length ? cart.groups : [{ vendorId: "cart", storeName: t("shop.cart"), deliveryFee: "0.00", subtotal: cart.subtotal, total: cart.total ?? cart.subtotal, items: cart.items }];
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <h1 className="text-3xl font-bold text-[#123b35]">{t("shop.cart")}</h1>
      {cart.items.length === 0 && <p className="mt-6 text-slate-600">{t("shop.emptyCart")}</p>}
      {cart.hasPriceChange && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A price changed after the item was added. The current database price is shown.</p>}
      {cart.hasUnavailable && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Some items are unavailable. Resolve them before checkout.</p>}
      <div className="mt-6 grid gap-6">
        {groups.map((group) => (
          <section key={group.vendorId} className="rounded-2xl border border-[#e1e9e5] bg-white p-4">
            <h2 className="font-bold text-[#123b35]">{group.storeName}</h2>
            <div className="mt-3 grid gap-3">
              {group.items.map((item) => (
                <article key={item.id} className="flex flex-wrap items-center gap-4 border-t border-[#edf1ef] pt-3">
                  {item.imageId ? <Image src={`/api/v1/products/images/${item.imageId}`} alt="" width={80} height={80} unoptimized className="size-20 rounded-lg object-cover" /> : <div className="size-20 rounded-lg bg-[#f5f8f6]" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{locale === "so" ? item.nameSo || item.name : item.name}</p>
                    <p className="text-sm text-slate-500">{item.variantName} · {item.sku}</p>
                    {item.priceChanged && <p className="text-xs text-amber-800">Was ${item.capturedPrice}</p>}
                    {!item.available && <p className="text-sm text-red-700">{t("shop.outOfStock")}</p>}
                  </div>
                  <input type="number" min={0} max={item.stockQuantity} value={item.quantity} onChange={(event) => void setCartQuantity(item.id, Number(event.target.value)).then((result) => setCart(result.cart))} className="w-20 rounded-lg border px-2 py-1" />
                  <p className="font-bold">${item.lineTotal}</p>
                </article>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">Delivery ${group.deliveryFee} · Vendor total ${group.total}</p>
          </section>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p>{t("shop.subtotal")}: ${cart.subtotal}</p>
          <p>Delivery: ${cart.deliveryTotal ?? "0.00"}</p>
          <p className="text-lg font-bold">{t("shop.total")}: ${cart.total ?? cart.subtotal}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${locale}/marketplace`} className="rounded-xl border px-4 py-2 font-semibold">{t("shop.continueShopping")}</Link>
          <button type="button" onClick={() => void requestApi("/api/v1/cart/clear", z.object({ cart: z.any() }), t("auth.requestFailed"), postJson({})).then((result) => setCart(result.cart))} className="rounded-xl border px-4 py-2 font-semibold">{t("shop.clearCart")}</button>
          <Link href={`/${locale}/checkout`} className={`rounded-xl bg-[#123b35] px-4 py-2 font-semibold text-white ${cart.hasUnavailable || cart.items.length === 0 ? "pointer-events-none opacity-50" : ""}`}>{t("shop.checkout")}</Link>
        </div>
      </div>
    </main>
  );
}
