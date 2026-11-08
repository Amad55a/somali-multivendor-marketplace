import { NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-cookie";

const localeRequestSchema = z.object({
  locale: z.enum(locales),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    throw error;
  }

  const parsed = localeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Unsupported locale." }, { status: 400 });
  }

  const response = NextResponse.json({ locale: parsed.data.locale });
  response.cookies.set(LOCALE_COOKIE, parsed.data.locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
