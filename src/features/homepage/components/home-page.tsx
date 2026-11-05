import { Suspense } from "react";
import type { Dictionary } from "@/i18n/types";
import { HeroSection } from "@/features/homepage/components/sections/hero-section";
import { MarketNetworkSection } from "@/features/homepage/components/sections/market-network-section";
import { DirectSuuqSection } from "@/features/homepage/components/sections/direct-suuq-section";
import { CategoriesSection } from "@/features/homepage/components/sections/categories-section";
import { FeaturedProductsSection } from "@/features/homepage/components/sections/featured-products-section";
import { MerchantStoresSection } from "@/features/homepage/components/sections/merchant-stores-section";
import { ConfidenceSection } from "@/features/homepage/components/sections/confidence-section";

export function HomePage({
  dictionary,
  searchParams,
}: Readonly<{
  dictionary: Dictionary;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  return (
    <main>
      <HeroSection copy={dictionary.hero} />
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
          <FeaturedProductsSection
            copy={dictionary.products}
            illustrationAltPrefix={dictionary.illustrationAltPrefix}
            illustrationLabel={dictionary.illustrationLabel}
          />
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
  const normalizedQuery =
    typeof q === "string" ? q.trim().toLocaleLowerCase() : "";
  const products = normalizedQuery
    ? {
        ...dictionary.products,
        entries: dictionary.products.entries.filter((product) =>
          [product.name, product.seller, product.tag]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        ),
      }
    : dictionary.products;

  return (
    <FeaturedProductsSection
      copy={products}
      illustrationAltPrefix={dictionary.illustrationAltPrefix}
      illustrationLabel={dictionary.illustrationLabel}
    />
  );
}
