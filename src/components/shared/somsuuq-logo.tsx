"use client";

import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function SomsuuqLogo({
  locale,
  inverse = false,
  href,
  subtitle,
  accessibleLabel,
  collapsed = false,
}: Readonly<{
  locale: Locale;
  inverse?: boolean;
  href?: string;
  subtitle?: string;
  accessibleLabel?: string;
  collapsed?: boolean;
}>) {
  const { t } = useTranslation();

  return (
    <Link
      href={href ?? `/${locale}`}
      aria-label={accessibleLabel ?? `${t("header.brand")} — ${subtitle ?? t("header.brandDescription")}`}
      className={`flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 ${
        inverse
          ? "focus-visible:outline-[#f4b942]"
          : "focus-visible:outline-[#123b35]"
      }`}
    >
      <Image
        src="/images/brand/somsuuq-mark.svg"
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-xl"
        unoptimized
      />
      {!collapsed && (
        <span>
          <span
            className={`block text-lg font-bold leading-5 tracking-tight ${
              inverse ? "text-white" : "text-[#123b35]"
            }`}
          >
            {t("header.brand")}
          </span>
          <span
            className={`hidden text-[11px] font-medium sm:block ${
              inverse ? "text-white/65" : "text-slate-500"
            }`}
          >
            {subtitle ?? t("header.brandDescription")}
          </span>
        </span>
      )}
    </Link>
  );
}
