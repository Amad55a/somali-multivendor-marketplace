import { useLocaleContext } from "@/i18n/locale-provider";

export function useTranslation() {
  const { locale, t, setLocale, isChangingLocale, changeError } =
    useLocaleContext();

  return { t, locale, setLocale, isChangingLocale, changeError };
}
