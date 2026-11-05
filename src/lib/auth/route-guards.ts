import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AccountType } from "../../../generated/prisma/client";
import { isLocale, type Locale } from "@/i18n/config";
import { AppError } from "@/lib/errors/app-error";
import { requireUser } from "@/features/auth/sessions";

export async function requirePageAccount(
  accountType: AccountType,
  localeValue: string,
) {
  if (!isLocale(localeValue)) redirect("/en");
  const locale: Locale = localeValue;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const request = new Request("https://somsuuq.internal/", {
    headers: { cookie: cookieHeader },
  });
  const loginPath =
    accountType === "ADMIN"
      ? `/${locale}/admin/login`
      : `/${locale}/login?accountType=${accountType}`;

  try {
    const user = await requireUser(request, [accountType]);
    if (
      accountType !== "ADMIN" &&
      !user.emailVerifiedAt &&
      !user.hasAmazonIdentity
    ) {
      redirect(
        `/${locale}/verify-email?${new URLSearchParams({
          email: user.email,
          accountType,
        })}`,
      );
    }
    return user;
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect(loginPath);
    }
    throw error;
  }
}
