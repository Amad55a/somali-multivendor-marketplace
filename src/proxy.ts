import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionCookieNames,
  restoreExpiredSession,
} from "@/features/auth/sessions";
import { isLocale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-cookie";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(savedLocale) ? savedLocale : "en";
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  const names = getSessionCookieNames();
  if (!request.cookies.has(names.refresh)) return NextResponse.next();

  try {
    const restored = await restoreExpiredSession(request);
    if (!restored) return NextResponse.next();

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      "cookie",
      `${names.access}=${restored.token}; ${names.refresh}=${restored.refreshToken}`,
    );
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set({
      name: names.access,
      value: restored.token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: restored.maxAgeSeconds,
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set({
      name: names.refresh,
      value: restored.refreshToken,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: restored.refreshMaxAgeSeconds,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("[auth] Session restoration failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/", "/en/:path*", "/so/:path*"],
};
