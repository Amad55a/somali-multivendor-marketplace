import {
  BadgeCheck,
  CreditCard,
  LockKeyhole,
  ShoppingBasket,
  Truck,
} from "lucide-react";
import type { Dictionary } from "@/i18n/types";

const confidenceIcons = [
  BadgeCheck,
  ShoppingBasket,
  LockKeyhole,
  Truck,
];

export function ConfidenceSection({
  copy,
}: Readonly<{ copy: Dictionary["confidence"] }>) {
  return (
    <section id="why-shop" className="bg-[#123b35] text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f4b942]">
            {copy.eyebrow}
          </p>
          <h2 className="text-2xl font-bold sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            {copy.description}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {copy.entries.map((item, index) => {
            const Icon = confidenceIcons[index] ?? CreditCard;
            return (
              <article
                key={item.title}
                className="rounded-xl bg-[#19483f] p-4 sm:p-5"
              >
                <span className="mb-4 grid size-11 place-items-center rounded-lg bg-[#f4b942] text-[#123b35]">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-white/65">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
