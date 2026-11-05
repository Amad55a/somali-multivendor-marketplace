import Image from "next/image";
import { ArrowRight, BadgeCheck, MapPin, Star } from "lucide-react";
import type { Dictionary } from "@/i18n/types";

const storeImages: Record<string, string> = {
  HH: "/images/stores/heritage-textiles.svg",
  ST: "/images/stores/technology-stall.svg",
  CN: "/images/stores/artisan-homewares.svg",
  GS: "/images/stores/aromatics-market.svg",
};

export function MerchantStoresSection({
  copy,
}: Readonly<{ copy: Dictionary["stores"] }>) {
  return (
    <section id="merchant-stores" className="bg-[#f8f9ff]">
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
          </div>
          <a
            href="#merchant-stores"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#8e610d] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
          >
            {copy.viewAll}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </a>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {copy.entries.map((store) => (
            <article
              key={store.initials}
              className="rounded-xl bg-white p-4 shadow-sm"
            >
              <div
                aria-hidden="true"
                className="relative mb-4 aspect-[2.4/1] overflow-hidden rounded-lg bg-[#f3f5ef]"
              >
                <Image
                  src={storeImages[store.initials]}
                  alt=""
                  fill
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#123b35] text-sm font-bold text-[#f4b942]"
                >
                  {store.initials}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f3ff] px-2 py-1 text-[9px] font-medium text-[#536183]">
                  <BadgeCheck aria-hidden="true" className="size-3" />
                  {copy.verified}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold leading-5 text-[#123b35]">
                {store.name}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                <MapPin aria-hidden="true" className="size-3 shrink-0" />
                {store.location}
              </p>
              <p className="mt-3 min-h-16 rounded-lg bg-[#f3f5ff] p-3 text-xs leading-5 text-slate-600">
                {store.description}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 text-[10px]">
                <span
                  aria-label={copy.ratingLabel.replace("{rating}", store.rating)}
                  className="inline-flex items-center gap-1 font-medium text-slate-700"
                >
                  <Star
                    aria-hidden="true"
                    className="size-3 fill-[#f4b942] text-[#c28a1c]"
                  />
                  {store.rating}
                  <span className="text-slate-500">({store.orders})</span>
                </span>
                <a
                  href="#featured-products"
                  className="inline-flex items-center gap-1 font-semibold text-[#8e610d] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
                >
                  {copy.visit}
                  <ArrowRight aria-hidden="true" className="size-3" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
