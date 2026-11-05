import { createHmac } from "node:crypto";
import type { AccountType } from "../../../generated/prisma/client";
import { getAuthConfig } from "@/config/env";
import { constantTimeEqual } from "@/features/auth/otp";

const COOKIE_NAME = "marketplace_pending_email_verification";
const PRODUCTION_COOKIE_NAME = "__Host-marketplace_pending_email_verification";
const LIFETIME_SECONDS = 60 * 60;

export type PendingEmailVerification = {
  userId: string;
  accountType: Extract<AccountType, "CUSTOMER" | "VENDOR">;
};

export function setPendingEmailVerificationCookie(
  response: Response,
  userId: string,
  accountType: PendingEmailVerification["accountType"],
): Response {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      accountType,
      expiresAt: Date.now() + LIFETIME_SECONDS * 1000,
    }),
  ).toString("base64url");
  const value = `${payload}.${sign(payload)}`;
  const secure = secureCookieAttribute();
  response.headers.append(
    "Set-Cookie",
    `${cookieName()}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${LIFETIME_SECONDS}${secure}`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function getPendingEmailVerification(
  request: Request,
): PendingEmailVerification | null {
  const cookie = request.headers.get("cookie");
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName()}=`))
    ?.slice(cookieName().length + 1);
  if (!value || value.length > 1024) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!constantTimeEqual(signature, sign(payload))) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("userId" in parsed) ||
      !("accountType" in parsed) ||
      !("expiresAt" in parsed) ||
      typeof parsed.userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.userId,
      ) ||
      (parsed.accountType !== "CUSTOMER" && parsed.accountType !== "VENDOR") ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }

    return { userId: parsed.userId, accountType: parsed.accountType };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function clearPendingEmailVerificationCookie(response: Response): Response {
  const secure = secureCookieAttribute();
  response.headers.append(
    "Set-Cookie",
    `${cookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
  );
  return response;
}

function sign(payload: string): string {
  return createHmac("sha256", getAuthConfig().secret)
    .update(`pending-email-verification\0${payload}`)
    .digest("base64url");
}

function cookieName(): string {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_COOKIE_NAME
    : COOKIE_NAME;
}

function secureCookieAttribute(): string {
  const appUrl = getAuthConfig().appUrl;
  return process.env.NODE_ENV === "production" ||
    new URL(appUrl).protocol === "https:"
    ? "; Secure"
    : "";
}
