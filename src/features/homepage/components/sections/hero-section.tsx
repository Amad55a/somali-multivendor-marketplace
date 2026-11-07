import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";

export function HeroSection({
  copy,
  locale,
}: Readonly<{ copy: Dictionary["hero"]; locale: Locale }>) {
  return (
    <section className="relative overflow-hidden bg-white">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full text-[#123b35] opacity-[0.07]"
        viewBox="0 0 1200 620"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M25 92 214 197l168-88 169 99 168-93 214 111 242-130M78 405l176-99 174 106 174-98 171 103 181-94 188 101M214 197l40 109m128-197-4 205m173-106 41 98m127-191 3 196m211-85 0 182"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <g fill="#f4b942">
          <circle cx="214" cy="197" r="7" />
          <circle cx="382" cy="109" r="7" />
          <circle cx="551" cy="208" r="7" />
          <circle cx="719" cy="115" r="7" />
          <circle cx="933" cy="226" r="7" />
          <circle cx="254" cy="306" r="7" />
          <circle cx="428" cy="412" r="7" />
          <circle cx="602" cy="314" r="7" />
          <circle cx="773" cy="417" r="7" />
          <circle cx="954" cy="323" r="7" />
        </g>
      </svg>
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-8 sm:px-8 sm:py-12 md:grid-cols-2 md:gap-8 lg:gap-12 lg:px-10 lg:py-16">
        <div>
          <div className="mb-5">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#edf1ef] px-3 py-1.5 text-[11px] font-semibold text-[#123b35]">
              <ShoppingBasket aria-hidden="true" className="size-3 text-[#b88012]" />
              {copy.eyebrow}
            </p>
          </div>
          <h1 className="max-w-2xl text-3xl font-bold leading-[1.08] tracking-tight text-[#123b35] sm:text-4xl lg:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            {copy.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/marketplace`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#123b35] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b5047] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
            >
              {copy.startShopping}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href={`/${locale}/marketplace`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#123b35] px-5 py-2.5 text-sm font-semibold text-[#123b35] transition-colors hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
            >
              {copy.exploreMarkets}
              <ShoppingBasket aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-600">
            <ShoppingBasket
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-[#b88012]"
            />
            {copy.trustLine}
          </p>
        </div>
        <div className="relative aspect-[5/4] min-h-64 overflow-hidden rounded-2xl bg-[#e8f0e9] shadow-[0_14px_30px_rgba(20,35,30,0.16)] sm:min-h-80 md:min-h-[18rem] lg:min-h-[25rem]">
          <Image
            src="/images/hero/marketplace-still-life.svg"
            alt={copy.imageAlt}
            fill
            fetchPriority="high"
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
