import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import type { Dictionary, MarketId } from "@/i18n/types";

const marketImages: Record<MarketId, string> = {
  mogadishu: "/images/markets/mogadishu.svg",
  hargeisa: "/images/markets/hargeisa.svg",
  somalia: "/images/markets/somalia.svg",
  galkayo: "/images/markets/galkayo.svg",
  bosaso: "/images/markets/bosaso.svg",
  xayat: "/images/markets/xayat.svg",
  baidoa: "/images/markets/baidoa.svg",
  jowhar: "/images/markets/jowhar.svg",
  kismayo: "/images/markets/kismayo.svg",
};

export function MarketNetworkSection({
  copy,
  illustrationAltPrefix,
  illustrationLabel,
}: Readonly<{
  copy: Dictionary["markets"];
  illustrationAltPrefix: string;
  illustrationLabel: string;
}>) {
  return (
    <section id="market-network" className="bg-[#f3f5ff]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a06c0b]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f4b942]" />
              {copy.eyebrow}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[#123b35] sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {copy.description}
            </p>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <MapPin aria-hidden="true" className="size-3.5 text-[#b88012]" />
            {copy.browseCount}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {copy.entries.map((market) => (
            <article
              key={market.id}
              className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-[2/1] overflow-hidden">
                <Image
                  src={marketImages[market.id]}
                  alt={`${illustrationAltPrefix}: ${market.name}, ${market.city}`}
                  fill
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                  className="object-cover"
                />
                <span className="absolute bottom-2 end-2 rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-[#123b35] shadow-sm">
                  {illustrationLabel}
                </span>
                <span className="absolute start-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-[#123b35] px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                  {market.city}
                </span>
              </div>
              <div className="p-4">
                <h3 className="text-base font-semibold leading-snug text-[#123b35]">
                  {market.name}
                </h3>
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">
                  {market.description}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                    <MapPin aria-hidden="true" className="size-3 text-[#b88012]" />
                    {copy.localMerchants}
                  </span>
                  <a
                    href="#categories"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#123b35] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
                  >
                    {copy.exploreMarket}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
