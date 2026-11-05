import en from "@/i18n/dictionaries/en.js";
import so from "@/i18n/dictionaries/so.js";
import type { Locale } from "@/i18n/config";
import type { Dictionary, TranslationKey } from "@/i18n/types";

const dictionaries: Record<Locale, Dictionary> = { en, so };

export function getDictionary(locale: Locale): Promise<Dictionary> {
  return Promise.resolve(dictionaries[locale]);
}

export function createTranslator(dictionary: Dictionary) {
  return (key: TranslationKey): string => {
    let value: unknown = dictionary;

    for (const segment of key.split(".")) {
      if (typeof value !== "object" || value === null || !(segment in value)) {
        throw new Error(`Missing translation: ${key}`);
      }
      value = (value as Record<string, unknown>)[segment];
    }

    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Translation is not a non-empty string: ${key}`);
    }

    return value;
  };
}
