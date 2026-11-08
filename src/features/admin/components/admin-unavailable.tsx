"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { TranslationKey } from "@/i18n/types";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function AdminUnavailable({
  locale,
  titleKey = "admin.unavailable.title",
  descriptionKey = "admin.unavailable.description",
}: Readonly<{
  locale: Locale;
  titleKey?: TranslationKey;
  descriptionKey?: TranslationKey;
}>) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-dashed border-[#cbd8d2] bg-white p-6">
      <h2 className="text-xl font-bold text-[#123b35]">
        {t(titleKey)}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {t(descriptionKey)}
      </p>
      <Link
        href={`/${locale}/admin/overview`}
        className="mt-5 inline-flex rounded-lg bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white"
      >
        {t("admin.navigation.overview")}
      </Link>
    </section>
  );
}
