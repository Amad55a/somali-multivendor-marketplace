import { Suspense } from "react";
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import { FeaturedProductsSection } from "@/features/homepage/components/sections/featured-products-section";
import { HeroSection } from "@/features/homepage/components/sections/hero-section";
import { MarketNetworkSection } from "@/features/homepage/components/sections/market-network-section";
import { DirectSuuqSection } from "@/features/homepage/components/sections/direct-suuq-section";
import { CategoriesSection } from "@/features/homepage/components/sections/categories-section";
import { MerchantStoresSection } from "@/features/homepage/components/sections/merchant-stores-section";
import { ConfidenceSection } from "@/features/homepage/components/sections/confidence-section";

export function HomePage({
  dictionary,
  locale,
  searchParams,
}: Readonly<{
  dictionary: Dictionary;
  locale: Locale;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  return (
    <main>
      <HeroSection copy={dictionary.hero} locale={locale} />
      <MarketNetworkSection
        copy={dictionary.markets}
        illustrationAltPrefix={dictionary.illustrationAltPrefix}
        illustrationLabel={dictionary.illustrationLabel}
      />
      <DirectSuuqSection
        copy={dictionary.directSuuq}
        illustrationAltPrefix={dictionary.illustrationAltPrefix}
      />
      <CategoriesSection
        copy={dictionary.categories}
        illustrationAltPrefix={dictionary.illustrationAltPrefix}
      />
      <Suspense
        fallback={
          <section className="bg-[#f5f8f6]">
            <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-slate-500">
              {dictionary.header.searchLoading}
            </div>
          </section>
        }
      >
        <SearchableFeaturedProducts
          dictionary={dictionary}
          searchParams={searchParams}
        />
      </Suspense>
      <MerchantStoresSection copy={dictionary.stores} />
      <ConfidenceSection copy={dictionary.confidence} />
    </main>
  );
}

async function SearchableFeaturedProducts({
  dictionary,
  searchParams,
}: Readonly<{
  dictionary: Dictionary;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";
  return (
    <FeaturedProductsSection
      copy={dictionary.products}
      illustrationAltPrefix={dictionary.illustrationAltPrefix}
      illustrationLabel={dictionary.illustrationLabel}
      search={search}
    />
  );
}
