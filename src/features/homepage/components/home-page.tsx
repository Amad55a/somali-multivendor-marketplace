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
  searchQuery = "",
}: Readonly<{ dictionary: Dictionary; searchQuery?: string }>) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
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
      <FeaturedProductsSection
        copy={products}
        illustrationAltPrefix={dictionary.illustrationAltPrefix}
        illustrationLabel={dictionary.illustrationLabel}
      />
      <MerchantStoresSection copy={dictionary.stores} />
      <ConfidenceSection copy={dictionary.confidence} />
    </main>
  );
}
