import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-cookie";

export const instant = false;

export default async function IndexPage() {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(savedLocale) ? savedLocale : "en";

  redirect(`/${locale}`);
}
