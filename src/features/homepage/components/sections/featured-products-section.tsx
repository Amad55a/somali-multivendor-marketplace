"use client";

import Image from "next/image";
import { useState } from "react";
import { ShoppingBag, Star } from "lucide-react";
import type { Dictionary, ProductFilter, ProductId } from "@/i18n/types";

const productImages: Record<ProductId, string> = {
  dabqaad: "/images/products/dabqaad.svg",
  dirac: "/images/products/dirac-fabric.svg",
  iphone: "/images/products/dual-sim-phone.svg",
  frankincense: "/images/products/frankincense-resin.svg",
  headphones: "/images/products/wireless-headphones.svg",
  macawiis: "/images/products/macawiis-textile.svg",
  honey: "/images/products/wildflower-honey.svg",
  samsung: "/images/products/smartphone-ultra.svg",
};

const filters: ProductFilter[] = ["all", "deals", "crafts", "tech"];

export function FeaturedProductsSection({
  copy,
  illustrationAltPrefix,
  illustrationLabel,
}: Readonly<{
  copy: Dictionary["products"];
  illustrationAltPrefix: string;
  illustrationLabel: string;
}>) {
  const [activeFilter, setActiveFilter] = useState<ProductFilter>("all");
  const products =
    activeFilter === "all"
      ? copy.entries
      : copy.entries.filter((product) => product.filter === activeFilter);

  return (
    <section id="featured-products" className="bg-[#f3f5ff]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a06c0b]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f4b942]" />
              {copy.eyebrow}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[#123b35] sm:text-3xl">
              {copy.title}
            </h2>
          </div>
          <div
            aria-label={copy.filterLabel}
            className="flex flex-wrap gap-2"
            role="group"
          >
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                onClick={() => setActiveFilter(filter)}
                className={`min-h-9 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35] ${
                  activeFilter === filter
                    ? "bg-[#123b35] text-white"
                    : "bg-white text-slate-700 hover:bg-[#e8ebfb]"
                }`}
              >
                {copy.filters[filter]}
              </button>
            ))}
          </div>
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl border border-[#dce4e1] bg-white px-4 py-8 text-center text-sm text-slate-600">
            {copy.noResults}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-xl bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md sm:p-3"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[#f7f7f4]">
                <Image
                  src={productImages[product.id]}
                  alt={`${illustrationAltPrefix}: ${product.imageAlt}`}
                  fill
                  sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                  className="object-contain p-3"
                />
                <span className="absolute bottom-2 start-2 rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-[#123b35] shadow-sm">
                  {illustrationLabel}
                </span>
                <span
                  className={`absolute top-2 rounded-md bg-[#f4b942] px-2 py-1 text-[9px] font-semibold text-[#123b35] shadow-sm ${
                    product.id === "iphone" || product.id === "samsung"
                      ? "end-2"
                      : "start-2"
                  }`}
                >
                  {product.tag}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3">
                <span className="min-w-0 truncate text-[10px] font-medium text-slate-600 sm:text-xs">
                  {product.seller}
                </span>
                <span
                  aria-label={copy.ratingLabel.replace("{rating}", product.rating)}
                  className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#123b35]"
                >
                  <Star
                    aria-hidden="true"
                    className="size-3 fill-[#f4b942] text-[#c28a1c]"
                  />
                  {product.rating}
                </span>
              </div>
              <h3 className="mt-2 min-h-10 text-xs font-semibold leading-5 text-[#123b35] sm:text-sm">
                {product.name}
              </h3>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-bold text-[#123b35] sm:text-base">
                    {product.price}
                  </span>
                  {product.previousPrice ? (
                    <span className="text-[10px] text-slate-400 line-through">
                      {product.previousPrice}
                    </span>
                  ) : null}
                </div>
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md bg-[#f4b942] text-[#123b35]"
                >
                  <ShoppingBag className="size-4" />
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
