"use server";

import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-cookie";

export async function saveLocalePreference(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error("Unsupported locale");
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
