import Image from "next/image";
import { ArrowDownRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { CategoryId, Dictionary } from "@/i18n/types";

const categoryImages: Record<CategoryId, string> = {
  fashion: "/images/categories/fashion.svg",
  electronics: "/images/categories/electronics.svg",
  home: "/images/categories/home-living.svg",
  fragrances: "/images/categories/fragrances.svg",
  food: "/images/categories/food-spices.svg",
  computing: "/images/categories/phones-computing.svg",
};

export function CategoriesSection({
  copy,
  illustrationAltPrefix,
}: Readonly<{
  copy: Dictionary["categories"];
  illustrationAltPrefix: string;
}>) {
  return (
    <section id="categories" className="bg-[#f3f5ff]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a06c0b]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f4b942]" />
              {copy.eyebrow}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[#123b35] sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{copy.description}</p>
          </div>
          <div aria-hidden="true" className="hidden gap-2 sm:flex">
            <span className="grid size-8 place-items-center rounded-full bg-[#e8ebfb] text-[#536183]">
              <ChevronLeft className="size-4" />
            </span>
            <span className="grid size-8 place-items-center rounded-full bg-[#e8ebfb] text-[#536183]">
              <ChevronRight className="size-4" />
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {copy.entries.map((category) => {
            return (
              <article
                key={category.id}
                className="flex min-h-28 items-start gap-4 rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-[#f3f5ef]">
                  <Image
                    src={categoryImages[category.id]}
                    alt={`${illustrationAltPrefix}: ${category.title}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#123b35]">
                    {category.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {category.description}
                  </p>
                  <a
                    href="#featured-products"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#9b690b] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[#123b35]"
                  >
                    {copy.browseItems}
                    <ArrowDownRight aria-hidden="true" className="size-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
