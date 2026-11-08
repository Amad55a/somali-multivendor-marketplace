import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.js";
import so from "@/i18n/dictionaries/so.js";
import { createTranslator } from "@/i18n/get-dictionary";
import { isLocale, locales } from "@/i18n/config";
import { assertDictionaryParity } from "@/i18n/validate-dictionary";

describe("locale dictionaries", () => {
  it("defines English as the supported default locale", () => {
    expect(locales[0]).toBe("en");
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("so")).toBe(true);
  });

  it("keeps English and Somali translation structures complete and in sync", () => {
    expect(() => assertDictionaryParity(en, so)).not.toThrow();
  });

  it("reports missing and empty translations", () => {
    expect(() =>
      assertDictionaryParity(
        { homepage: { title: "Shop" } },
        { homepage: {} },
      ),
    ).toThrow("Translation keys differ at dictionary.homepage");
    expect(() =>
      assertDictionaryParity(
        { homepage: { title: "Shop" } },
        { homepage: { title: "  " } },
      ),
    ).toThrow("Missing translation at dictionary.homepage.title");
  });

  it("resolves type-safe nested translation keys in both languages", () => {
    expect(createTranslator(en)("hero.title")).toBe(
      "Shop Your Favourite Somali Markets From Home.",
    );
    expect(createTranslator(so)("products.filters.all")).toBe(
      "Dhammaan Alaabta",
    );
    expect(createTranslator(en)("support.helpTitle")).toBe(
      "How can we help?",
    );
    expect(createTranslator(so)("support.helpTitle")).toBe(
      "Sideen kuu caawin karnaa?",
    );
    expect(createTranslator(en)("support.widget.title")).toBe(
      "Somsuuq Help Center",
    );
    expect(createTranslator(so)("support.widget.title")).toBe(
      "Xarunta Caawinta Somsuuq",
    );
  });
});
