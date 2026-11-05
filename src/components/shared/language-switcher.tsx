"use client";

import { useTranslation } from "@/i18n/hooks/use-translation";

export function LanguageSwitcher() {
  const { locale, setLocale, isChangingLocale, changeError, t } =
    useTranslation();

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        aria-label={t("language.label")}
        className="inline-flex rounded-full border border-[#dce4e1] bg-white p-1 shadow-sm"
        role="group"
      >
        {(["en", "so"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={locale === option}
            disabled={isChangingLocale}
            onClick={() => setLocale(option)}
            className={`min-h-8 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35] disabled:cursor-wait disabled:opacity-60 ${
              locale === option
                ? "bg-[#123b35] text-white"
                : "text-[#123b35] hover:bg-[#eff4f1]"
            }`}
          >
            {option === "en" ? t("language.english") : t("language.somali")}
          </button>
        ))}
      </div>
      {changeError ? (
        <p aria-live="polite" className="max-w-48 text-end text-xs text-red-700">
          {changeError}
        </p>
      ) : null}
    </div>
  );
}
