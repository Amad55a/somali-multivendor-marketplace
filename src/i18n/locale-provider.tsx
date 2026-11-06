"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { saveLocalePreference } from "@/i18n/save-locale-preference";
import { isLocale, type Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/get-dictionary";
import type { Dictionary, TranslationKey } from "@/i18n/types";

interface LocaleContextValue {
  locale: Locale;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => void;
  isChangingLocale: boolean;
  changeError: string | null;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: Readonly<{
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const t = useMemo(() => createTranslator(dictionary), [dictionary]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      if (!isLocale(nextLocale)) {
        throw new Error("Unsupported locale");
      }
      if (nextLocale === locale) return;

      setChangeFailed(false);
      setIsChangingLocale(true);
      const nextPath = pathname.replace(/^\/(en|so)(?=\/|$)/, `/${nextLocale}`);
      void saveLocalePreference(nextLocale)
        .then(() => window.location.assign(nextPath))
        .catch((error: unknown) => {
          console.error("Unable to save the language preference", error);
          setChangeFailed(true);
          setIsChangingLocale(false);
        });
    },
    [locale, pathname],
  );

  const contextValue = useMemo(
    () => ({
      locale,
      t,
      setLocale,
      isChangingLocale,
      changeError: changeFailed ? t("language.changeError") : null,
    }),
    [changeFailed, isChangingLocale, locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleContext(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleContext must be used within LocaleProvider");
  }
  return context;
}
