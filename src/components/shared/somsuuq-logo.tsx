"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function SomsuuqLogo({
  locale,
  inverse = false,
}: Readonly<{ locale: Locale; inverse?: boolean }>) {
  const { t } = useTranslation();

  return (
    <Link
      href={`/${locale}`}
      aria-label={`${t("header.brand")} — ${t("header.brandDescription")}`}
      className={`flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 ${
        inverse
          ? "focus-visible:outline-[#f4b942]"
          : "focus-visible:outline-[#123b35]"
      }`}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-[#123b35] text-[#f4b942]">
        <Store aria-hidden="true" className="size-5" />
      </span>
      <span>
        <span
          className={`block text-lg font-bold leading-5 tracking-tight ${
            inverse ? "text-white" : "text-[#123b35]"
          }`}
        >
          {t("header.brand")}
        </span>
        <span
          className={`hidden text-[10px] font-medium sm:block ${
            inverse ? "text-white/75" : "text-slate-500"
          }`}
        >
          {t("header.brandDescription")}
        </span>
      </span>
    </Link>
  );
}
