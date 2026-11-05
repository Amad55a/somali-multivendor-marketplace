import Image from "next/image";
import { ArrowRight, BadgeCheck, CircleCheck } from "lucide-react";
import type { Dictionary } from "@/i18n/types";

export function DirectSuuqSection({
  copy,
  illustrationAltPrefix,
}: Readonly<{
  copy: Dictionary["directSuuq"];
  illustrationAltPrefix: string;
}>) {
  return (
    <section className="bg-[#f3f5ff] px-4 pb-8 sm:px-8 lg:px-10">
      <div
        id="direct-suuq"
        className="mx-auto grid max-w-7xl gap-6 rounded-2xl bg-[#123b35] p-6 text-white shadow-lg sm:grid-cols-[1fr_auto] sm:items-center sm:p-8 lg:grid-cols-[1fr_260px_auto]"
      >
        <div>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f4b942] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#123b35]">
            <BadgeCheck aria-hidden="true" className="size-3" />
            {copy.eyebrow}
          </p>
          <h2 className="text-2xl font-bold sm:text-3xl">{copy.title}</h2>
          <p className="mt-2 text-sm text-white/70">{copy.description}</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck aria-hidden="true" className="size-3.5 text-[#f4b942]" />
              {copy.verifiedInventory}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck aria-hidden="true" className="size-3.5 text-[#f4b942]" />
              {copy.directContact}
            </span>
          </div>
        </div>
        <div className="relative mx-auto aspect-[14/9] w-full max-w-[280px] overflow-hidden rounded-xl bg-[#174a40] sm:col-span-2 sm:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <Image
            src="/images/direct-suuq/merchant-connection.svg"
            alt={`${illustrationAltPrefix}: ${copy.title}, ${copy.description}`}
            fill
            sizes="(max-width: 639px) 80vw, 280px"
            className="object-cover"
          />
        </div>
        <a
          href="#featured-products"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#f4b942] px-5 py-3 text-sm font-semibold text-[#123b35] transition-colors hover:bg-[#ffd16c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:col-span-2 sm:row-start-3 lg:col-span-1 lg:col-start-3 lg:row-start-1"
        >
          {copy.explore}
          <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </section>
  );
}
