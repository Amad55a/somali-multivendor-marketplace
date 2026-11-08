"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";

type Receipt = {
  receiptNumber: string;
  orderNumber: string;
  customerName: string;
  method: string;
  maskedMobile: string;
  amount: string;
  currency: string;
  transactionReference: string;
  paidAt: string;
};

export function PaymentReceiptView({ locale, receipt }: Readonly<{ locale: Locale; receipt: Receipt }>) {
  const somali = locale === "so";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 print:max-w-none print:p-0">
      <div className="receipt-actions mb-5 flex flex-wrap gap-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#123b35] px-4 py-2 font-semibold text-white">
          {somali ? "Daabac rasiidka" : "Print receipt"}
        </button>
        <Link href={`/${locale}/customer/orders`} className="rounded-xl border px-4 py-2 font-semibold text-[#123b35]">
          {somali ? "Ku noqo dalabyada" : "Back to orders"}
        </Link>
      </div>
      <article className="rounded-3xl border border-[#dce6e1] bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <SomsuuqLogo locale={locale} subtitle={somali ? "Rasiidka lacag-bixinta" : "Payment receipt"} />
        <div className="mt-8 border-y border-dashed py-5">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-amber-800">
            {somali ? "LACAG-BIXIN TIJAABO AH / LACAG DHAB AH LAMA WAREEJIN" : "SIMULATED PAYMENT / NO REAL MONEY TRANSFERRED"}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[#123b35]">{somali ? "Rasiid" : "Receipt"}</h1>
          <p className="mt-1 font-mono text-sm">{receipt.receiptNumber}</p>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-slate-500">{somali ? "Dalabka" : "Order"}</dt><dd className="font-semibold">{receipt.orderNumber}</dd></div>
          <div><dt className="text-sm text-slate-500">{somali ? "Macmiilka" : "Customer"}</dt><dd className="font-semibold">{receipt.customerName}</dd></div>
          <div><dt className="text-sm text-slate-500">{somali ? "Habka lacag-bixinta" : "Payment method"}</dt><dd className="font-semibold">{receipt.method.replace("_", " ")}</dd></div>
          <div><dt className="text-sm text-slate-500">{somali ? "Telefoonka la qariyey" : "Masked mobile"}</dt><dd className="font-semibold">{receipt.maskedMobile}</dd></div>
          <div><dt className="text-sm text-slate-500">{somali ? "Lacagta" : "Amount"}</dt><dd className="text-xl font-bold">{receipt.currency} {receipt.amount}</dd></div>
          <div><dt className="text-sm text-slate-500">{somali ? "Waqtiga lacag-bixinta" : "Payment time"}</dt><dd className="font-semibold">{new Date(receipt.paidAt).toLocaleString(locale)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-slate-500">{somali ? "Tixraaca macaamilka tijaabada ah" : "Simulated transaction reference"}</dt><dd className="break-all font-mono text-sm">{receipt.transactionReference}</dd></div>
        </dl>
        <p className="mt-8 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-950">
          {somali ? "Tani waa lacag-bixin la matalay oo keliya. Lacag dhab ah lama wareejin, adeeg mobile money dhab ahna lama isticmaalin." : "This is a simulated payment only. No real money was transferred and no real mobile-money provider was used."}
        </p>
      </article>
    </main>
  );
}
