import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import Link from "next/link";
import { MarketplaceBrowser } from "@/features/products/components/marketplace-browser";

export function CustomerHome({
  dictionary,
  locale,
  email,
  searchQuery,
}: Readonly<{
  dictionary: Dictionary;
  locale: Locale;
  email: string;
  searchQuery: string;
}>) {
  return (
    <main>
      <section className="border-b border-[#e1e9e5] bg-[#f5f8f6]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:px-10">
          <p className="text-sm font-semibold text-[#a06c0b]">
            {dictionary.auth.customerWorkspace}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#123b35] sm:text-4xl">
            {dictionary.auth.accountTitle}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {dictionary.auth.signedInAs}:{" "}
            <span className="font-semibold text-[#123b35]">{email}</span>
          </p>
          <Link href={`/${locale}/customer/orders`} className="mt-5 inline-block text-sm font-semibold text-[#8b5e08] hover:underline">
            {dictionary.shop.myOrders}
          </Link>
        </div>
      </section>
      <MarketplaceBrowser locale={locale} initialSearch={searchQuery} />
    </main>
  );
}
