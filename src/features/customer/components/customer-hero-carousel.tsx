"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";

const artwork = [
  "/images/hero/somsuuq-marketplace-hero.png",
  "/images/hero/marketplace-still-life.svg",
  "/images/markets/somalia.svg",
];

export function CustomerHeroCarousel({
  locale,
  dictionary,
}: Readonly<{ locale: Locale; dictionary: Dictionary }>) {
  const [active, setActive] = useState(0);
  const slides = dictionary.customerDashboard.slides;
  const backward = locale === "so" ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />;
  const forward = locale === "so" ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((index) => (index + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  function move(direction: -1 | 1) {
    setActive((index) => (index + direction + slides.length) % slides.length);
  }

  const slide = slides[active];
  return (
    <section
      aria-roledescription="carousel"
      aria-label={dictionary.shop.home}
      className="relative overflow-hidden bg-[#123b35] text-white"
    >
      <div className="pointer-events-none absolute -end-24 -top-32 size-[26rem] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -end-10 -top-16 size-[20rem] rounded-full border border-[#f4b942]/20" />
      <div className="mx-auto grid min-h-[26rem] max-w-7xl items-center gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.05fr_0.95fr] md:py-14 lg:px-10">
        <div aria-live="polite" aria-atomic="true" key={active} className="relative z-10">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#f4b942]">{slide.eyebrow}</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {slide.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/75">{slide.description}</p>
          <Link
            href={`/${locale}/marketplace`}
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#f4b942] px-5 text-sm font-bold text-[#123b35] transition hover:bg-[#ffce68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {slide.action}
            {forward}
          </Link>
        </div>
        <div className="relative min-h-56 overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl sm:min-h-80">
          <Image
            key={artwork[active]}
            src={artwork[active]}
            alt={slide.imageAlt}
            fill
            priority={active === 0}
            sizes="(max-width: 767px) 100vw, 48vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#123b35]/20 to-transparent" />
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-6 sm:px-8 lg:px-10">
        <div className="flex items-center gap-2">
          {slides.map((item, index) => (
            <button
              key={item.eyebrow}
              type="button"
              aria-label={`${dictionary.customerDashboard.goToSlide} ${index + 1}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => setActive(index)}
              className={`h-2.5 rounded-full transition-all ${active === index ? "w-8 bg-[#f4b942]" : "w-2.5 bg-white/50 hover:bg-white"}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={dictionary.customerDashboard.previousSlide} onClick={() => move(-1)} className="grid size-10 place-items-center rounded-full border border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {backward}
          </button>
          <button type="button" aria-label={dictionary.customerDashboard.nextSlide} onClick={() => move(1)} className="grid size-10 place-items-center rounded-full border border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {forward}
          </button>
        </div>
      </div>
    </section>
  );
}
