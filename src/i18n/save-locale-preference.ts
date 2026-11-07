import { isLocale, type Locale } from "@/i18n/config";

export async function saveLocalePreference(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error("Unsupported locale");
  }

  const response = await fetch("/api/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale }),
  });
  if (!response.ok) {
    throw new Error(`Could not save locale preference (${response.status}).`);
  }
}
