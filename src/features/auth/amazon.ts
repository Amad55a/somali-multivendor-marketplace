import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AccountType } from "../../../generated/prisma/client";
import { getAmazonConfig, getAuthConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { createSession, setSessionCookie } from "@/features/auth/sessions";
import { emailSchema } from "@/features/auth/validation/schemas";

const STATE_COOKIE = "__Host-marketplace_amazon_state";
const DEVELOPMENT_STATE_COOKIE = "marketplace_amazon_state";
const PKCE_COOKIE = "__Host-marketplace_amazon_pkce";
const DEVELOPMENT_PKCE_COOKIE = "marketplace_amazon_pkce";
const STATE_LIFETIME_MS = 5 * 60 * 1000;

const amazonTokenSchema = z.object({ access_token: z.string().min(1) });
const amazonProfileSchema = z.object({
  user_id: z.string().min(1).max(255),
  email: emailSchema,
  name: z.string().max(160).optional(),
});

export function startAmazonLogin(
  accountType: "CUSTOMER" | "VENDOR",
  locale: "en" | "so" = "en",
): Response {
  const config = getAmazonConfig();
  if (!config) {
    throw new AppError(
      "AMAZON_LOGIN_UNAVAILABLE",
      503,
      "Amazon sign-in is not configured.",
    );
  }

  const state = createAmazonOAuthState(accountType, locale);
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const authorizationUrl = new URL("https://www.amazon.com/ap/oa");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("scope", "profile");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  const response = new Response(null, {
    status: 302,
    headers: { Location: authorizationUrl.toString() },
  });
  const secure = secureCookieAttribute();
  response.headers.append(
    "Set-Cookie",
    `${stateCookieName()}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${secure}`,
  );
  response.headers.append(
    "Set-Cookie",
    `${pkceCookieName()}=${codeVerifier}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${secure}`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function completeAmazonLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const appUrl = getAuthConfig().appUrl;
  const secure = secureCookieAttribute();
  const clearState = `${stateCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  const clearPkce = `${pkceCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  const clearCookie = (response: Response) => {
    response.headers.append("Set-Cookie", clearState);
    response.headers.append("Set-Cookie", clearPkce);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const redirect = (
    result: string,
    locale: "en" | "so" = "en",
    accountType?: "CUSTOMER" | "VENDOR",
  ) => {
    const query = new URLSearchParams({ status: result });
    if (accountType) query.set("accountType", accountType);
    return clearCookie(
      new Response(null, {
        status: 303,
        headers: {
          Location: new URL(`/${locale}/auth/result?${query}`, appUrl).toString(),
        },
      }),
    );
  };

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const expectedState = parseCookie(request.headers.get("cookie"), stateCookieName());
  const codeVerifier = parseCookie(request.headers.get("cookie"), pkceCookieName());
  if (!state || !expectedState || !constantTimeEqual(state, expectedState)) {
    console.warn("[auth] Amazon callback rejected", {
      reason: !state
        ? "state_missing"
        : !expectedState
          ? "state_cookie_missing"
          : "state_mismatch",
    });
    return redirect("amazon_failed");
  }
  const parsedState = state ? verifyAmazonOAuthState(state, expectedState) : null;
  if (!parsedState) {
    console.warn("[auth] Amazon callback rejected", {
      reason: "state_invalid_or_expired",
    });
    return redirect("amazon_failed");
  }
  if (!codeVerifier) {
    console.warn("[auth] Amazon callback rejected", {
      reason: "pkce_verifier_missing",
    });
    return redirect("amazon_failed", parsedState.locale, parsedState.accountType);
  }
  if (requestUrl.searchParams.has("error")) {
    return redirect("amazon_cancelled", parsedState.locale, parsedState.accountType);
  }
  if (!code) {
    return redirect("amazon_failed", parsedState.locale, parsedState.accountType);
  }

  const config = getAmazonConfig();
  if (!config) {
    return redirect("amazon_unavailable", parsedState.locale, parsedState.accountType);
  }

  const profile = await getAmazonProfile(code, codeVerifier, config);
  const accountType = parsedState.accountType;
  const completeSignIn = async (user: {
    id: string;
    accountType: "CUSTOMER" | "VENDOR";
  }) => {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    if (user.accountType === "VENDOR") {
      await prisma.vendorProfile.updateMany({
        where: { userId: user.id },
        data: { verificationStatus: "VERIFIED" },
      });
    }
    const vendorApplication =
      user.accountType === "VENDOR"
        ? await prisma.vendorProfile.findUnique({
            where: { userId: user.id },
            select: { applicationStatus: true },
          })
        : null;
    const destination =
      user.accountType === "CUSTOMER"
        ? `/${parsedState.locale}/customer/dashboard`
        : vendorApplication?.applicationStatus === "APPROVED"
          ? `/${parsedState.locale}/vendor/dashboard`
          : vendorApplication
            ? `/${parsedState.locale}/vendor/status`
            : `/${parsedState.locale}/vendor/onboarding`;
    const session = await createSession(user);
    return setSessionCookie(
      clearCookie(
        new Response(null, {
          status: 303,
          headers: { Location: new URL(destination, appUrl).toString() },
        }),
      ),
      session,
    );
  };
  const identity = await prisma.userAuthAccount.findUnique({
    where: {
      provider_providerAccountId_accountType: {
        provider: "AMAZON",
        providerAccountId: profile.user_id,
        accountType,
      },
    },
    include: { user: true },
  });

  if (identity) {
    if (!identity.user.isActive) {
      return redirect("amazon_failed", parsedState.locale, accountType);
    }
    return completeSignIn({ id: identity.user.id, accountType });
  }

  const existingSameTypeUser = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType,
        normalizedEmail: profile.email,
      },
    },
    select: { id: true },
  });
  if (existingSameTypeUser) {
    return redirect("account_link_required", parsedState.locale, accountType);
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: profile.email,
        normalizedEmail: profile.email,
        accountType,
        emailVerifiedAt: new Date(),
        displayName: profile.name?.trim() || null,
        authAccounts: {
          create: {
            provider: "AMAZON",
            providerAccountId: profile.user_id,
          },
        },
      },
      select: { id: true },
    });
    return completeSignIn({ ...user, accountType });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return redirect("account_link_required", parsedState.locale, accountType);
    }
    throw error;
  }
}

export function createAmazonOAuthState(
  accountType: "CUSTOMER" | "VENDOR",
  locale: "en" | "so" = "en",
): string {
  const authConfig = getAuthConfig();
  const payload = Buffer.from(
    JSON.stringify({
      accountType,
      locale,
      nonce: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + STATE_LIFETIME_MS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", authConfig.secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAmazonOAuthState(
  state: string,
  cookieState: string | null,
): { accountType: "CUSTOMER" | "VENDOR"; locale: "en" | "so" } | null {
  if (!cookieState || !constantTimeEqual(state, cookieState)) return null;

  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expectedSignature = createHmac("sha256", getAuthConfig().secret)
    .update(payload)
    .digest("base64url");
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("accountType" in parsed) ||
      !("locale" in parsed) ||
      !("nonce" in parsed) ||
      !("expiresAt" in parsed) ||
      !isCustomerOrVendor(parsed.accountType) ||
      (parsed.locale !== "en" && parsed.locale !== "so") ||
      typeof parsed.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(parsed.nonce) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return { accountType: parsed.accountType, locale: parsed.locale };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function getAmazonProfile(
  authorizationCode: string,
  codeVerifier: string,
  config: { clientId: string; clientSecret: string; redirectUri: string },
) {
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizationCode,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[auth] Amazon token exchange failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    throw new AppError("AMAZON_LOGIN_UNAVAILABLE", 503, "Amazon sign-in is temporarily unavailable.");
  }
  if (!tokenResponse.ok) {
    console.warn("[auth] Amazon token exchange rejected", {
      status: tokenResponse.status,
    });
    throw new AppError("AMAZON_LOGIN_FAILED", 401, "Amazon sign-in could not be completed.");
  }

  const tokenResult = amazonTokenSchema.safeParse(
    await readJson(tokenResponse),
  );
  if (!tokenResult.success) {
    console.warn("[auth] Amazon token response was invalid");
    throw new AppError("AMAZON_LOGIN_FAILED", 401, "Amazon sign-in could not be completed.");
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetch("https://api.amazon.com/user/profile", {
      headers: { authorization: `Bearer ${tokenResult.data.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[auth] Amazon profile lookup failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    throw new AppError("AMAZON_LOGIN_UNAVAILABLE", 503, "Amazon sign-in is temporarily unavailable.");
  }
  if (!profileResponse.ok) {
    console.warn("[auth] Amazon profile lookup rejected", {
      status: profileResponse.status,
    });
    throw new AppError("AMAZON_LOGIN_FAILED", 401, "Amazon sign-in could not be completed.");
  }

  const profileResult = amazonProfileSchema.safeParse(
    await readJson(profileResponse),
  );
  if (!profileResult.success) {
    console.warn("[auth] Amazon profile response was invalid", {
      issueCodes: profileResult.error.issues.map((issue) => issue.code),
    });
    throw new AppError("AMAZON_LOGIN_FAILED", 401, "Amazon sign-in could not be completed.");
  }
  return profileResult.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function isCustomerOrVendor(value: unknown): value is Extract<AccountType, "CUSTOMER" | "VENDOR"> {
  return value === "CUSTOMER" || value === "VENDOR";
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function stateCookieName(): string {
  return usesSecureCookies()
    ? STATE_COOKIE
    : DEVELOPMENT_STATE_COOKIE;
}

function pkceCookieName(): string {
  return usesSecureCookies()
    ? PKCE_COOKIE
    : DEVELOPMENT_PKCE_COOKIE;
}

function usesSecureCookies(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    new URL(getAuthConfig().appUrl).protocol === "https:"
  );
}

function secureCookieAttribute(): string {
  return usesSecureCookies() ? "; Secure" : "";
}

function parseCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator <= 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
