import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import { LiveCatalogSection } from "@/features/homepage/components/sections/live-catalog-section";
import { CustomerHeroCarousel } from "@/features/customer/components/customer-hero-carousel";

export function CustomerMarketplaceHome({
  locale,
  dictionary,
  search,
}: Readonly<{ locale: Locale; dictionary: Dictionary; search: string }>) {
  return (
    <main>
      <CustomerHeroCarousel locale={locale} dictionary={dictionary} />
      <LiveCatalogSection locale={locale} search={search} />
    </main>
  );
}
