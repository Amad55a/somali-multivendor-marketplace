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
const STATE_COOKIE_SEPARATOR = "~";
const STATE_LIFETIME_MS = 5 * 60 * 1000;
const CALLBACK_MESSAGES = {
  state_missing: "Amazon did not return the OAuth state.",
  state_cookie_missing: "The browser did not return the OAuth state cookie.",
  state_mismatch: "The callback state did not match the browser cookie.",
  state_invalid_or_expired: "The callback state was invalid or expired.",
  pkce_verifier_missing: "The browser did not return the PKCE verifier.",
  authorization_code_missing: "Amazon did not return an authorization code.",
  account_disabled: "The Amazon identity belongs to a disabled account.",
  callback_origin_mismatch: "Start Amazon sign-in from the configured public application URL.",
} as const;

const amazonTokenSchema = z.object({ access_token: z.string().min(1) });
const amazonProfileSchema = z.object({
  user_id: z.string().min(1).max(255),
  email: emailSchema,
  name: z.string().max(160).optional(),
});

export function startAmazonLogin(
  accountType: "CUSTOMER" | "VENDOR",
  locale: "en" | "so" = "en",
  request?: Request,
): Response {
  let config: ReturnType<typeof getAmazonConfig>;
  try {
    config = getAmazonConfig();
  } catch (error) {
    logAmazonCallbackFailure(
      "authorization_start",
      "AMAZON_CONFIGURATION_UNAVAILABLE",
      "Amazon sign-in configuration could not be loaded.",
    );
    throw error;
  }
  if (!config) {
    throw new AppError(
      "AMAZON_LOGIN_UNAVAILABLE",
      503,
      "Amazon sign-in is not configured.",
    );
  }
  if (request) {
    const origin = request.headers.get("origin");
    const appOrigin = new URL(getAuthConfig().appUrl).origin;
    const originMatches = isConfiguredBrowserOrigin(origin, appOrigin);
    if (!originMatches) {
      logAmazonCallbackFailure(
        "authorization_start",
        "AMAZON_CALLBACK_ORIGIN_MISMATCH",
        CALLBACK_MESSAGES.callback_origin_mismatch,
        {
          originHeaderPresent: origin !== null,
          browserOriginMatchesConfigured: originMatches,
          requestUrlMatchesConfigured:
            new URL(request.url).origin === appOrigin,
          forwardedHostPresent: request.headers.has("x-forwarded-host"),
          forwardedProtoPresent: request.headers.has("x-forwarded-proto"),
        },
      );
      throw new AppError(
        "AMAZON_CALLBACK_ORIGIN_MISMATCH",
        400,
        CALLBACK_MESSAGES.callback_origin_mismatch,
      );
    }
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
    `${stateCookieName()}=${state}${STATE_COOKIE_SEPARATOR}${codeVerifier}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${secure}`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function completeAmazonLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const appUrl = getAuthConfig().appUrl;
  const secure = secureCookieAttribute();
  const clearState = `${stateCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  const clearLegacyPkce = `${pkceCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  const clearCookie = (response: Response) => {
    response.headers.append("Set-Cookie", clearState);
    response.headers.append("Set-Cookie", clearLegacyPkce);
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
  const stateCookie = parseCookie(request.headers.get("cookie"), stateCookieName());
  logAmazonCallbackSuccess(
    "callback_received",
    "AMAZON_CALLBACK_RECEIVED",
    "Amazon returned to the callback endpoint.",
    {
      hasAuthorizationCode: Boolean(code),
      hasState: Boolean(state),
      hasStateCookie: Boolean(stateCookie),
    },
  );
  const separatorIndex = stateCookie?.lastIndexOf(STATE_COOKIE_SEPARATOR) ?? -1;
  const expectedState =
    separatorIndex > 0
      ? stateCookie?.slice(0, separatorIndex) ?? null
      : stateCookie;
  const legacyCodeVerifier =
    separatorIndex > 0
      ? null
      : parseCookie(request.headers.get("cookie"), pkceCookieName());
  const codeVerifier =
    separatorIndex > 0
      ? stateCookie?.slice(separatorIndex + 1) ?? null
      : legacyCodeVerifier;
  const requestOriginMatchesConfiguredOrigin =
    requestUrl.origin === new URL(appUrl).origin;
  if (!state) {
    logAmazonCallbackFailure(
      "state_validation",
      "AMAZON_STATE_MISSING",
      CALLBACK_MESSAGES.state_missing,
    );
    return redirect("amazon_failed");
  }
  if (!expectedState) {
    logAmazonCallbackFailure(
      "state_validation",
      "AMAZON_STATE_COOKIE_MISSING",
      CALLBACK_MESSAGES.state_cookie_missing,
      { requestOriginMatchesConfiguredOrigin },
    );
    return redirect("amazon_failed");
  }
  if (!constantTimeEqual(state, expectedState)) {
    logAmazonCallbackFailure(
      "state_validation",
      "AMAZON_STATE_MISMATCH",
      CALLBACK_MESSAGES.state_mismatch,
      { requestOriginMatchesConfiguredOrigin },
    );
    return redirect("amazon_failed");
  }
  const parsedState = state ? verifyAmazonOAuthState(state, expectedState) : null;
  if (!parsedState) {
    logAmazonCallbackFailure(
      "state_validation",
      "AMAZON_STATE_INVALID_OR_EXPIRED",
      CALLBACK_MESSAGES.state_invalid_or_expired,
    );
    return redirect("amazon_failed");
  }
  logAmazonCallbackSuccess(
    "state_validation",
    "AMAZON_STATE_VALID",
    "OAuth state and expiration were validated.",
  );
  if (!codeVerifier) {
    logAmazonCallbackFailure(
      "pkce_validation",
      "AMAZON_PKCE_VERIFIER_MISSING",
      CALLBACK_MESSAGES.pkce_verifier_missing,
    );
    return redirect("amazon_failed", parsedState.locale, parsedState.accountType);
  }
  logAmazonCallbackSuccess(
    "pkce_validation",
    "AMAZON_PKCE_VERIFIER_PRESENT",
    "The browser returned the PKCE verifier.",
  );
  if (requestUrl.searchParams.has("error")) {
    logAmazonCallbackFailure(
      "authorization_response",
      "AMAZON_AUTHORIZATION_REJECTED",
      "Amazon did not authorize the sign-in request.",
    );
    return redirect("amazon_cancelled", parsedState.locale, parsedState.accountType);
  }
  if (!code) {
    logAmazonCallbackFailure(
      "authorization_response",
      "AMAZON_AUTHORIZATION_CODE_MISSING",
      CALLBACK_MESSAGES.authorization_code_missing,
    );
    return redirect("amazon_failed", parsedState.locale, parsedState.accountType);
  }
  logAmazonCallbackSuccess(
    "authorization_response",
    "AMAZON_AUTHORIZATION_CODE_RECEIVED",
    "Amazon returned an authorization code.",
  );

  let config: ReturnType<typeof getAmazonConfig>;
  try {
    config = getAmazonConfig();
  } catch (error) {
    logAmazonCallbackFailure(
      "authorization_response",
      "AMAZON_CONFIGURATION_UNAVAILABLE",
      "Amazon sign-in configuration could not be loaded.",
    );
    throw error;
  }
  if (!config) {
    logAmazonCallbackFailure(
      "configuration",
      "AMAZON_CONFIGURATION_MISSING",
      "Amazon sign-in is not configured.",
    );
    return redirect("amazon_unavailable", parsedState.locale, parsedState.accountType);
  }
  logAmazonCallbackSuccess(
    "configuration",
    "AMAZON_CONFIGURATION_VALID",
    "Amazon sign-in configuration is available.",
  );

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
  const identity = await withAmazonCallbackStage(
    "account_lookup",
    "The linked Amazon account could not be loaded.",
    () =>
      prisma.userAuthAccount.findUnique({
        where: {
          provider_providerAccountId_accountType: {
            provider: "AMAZON",
            providerAccountId: profile.user_id,
            accountType,
          },
        },
        include: { user: true },
      }),
  );

  if (identity) {
    if (!identity.user.isActive) {
      logAmazonCallbackFailure(
        "account_validation",
        "AMAZON_ACCOUNT_DISABLED",
        CALLBACK_MESSAGES.account_disabled,
      );
      return redirect("amazon_failed", parsedState.locale, accountType);
    }
    logAmazonCallbackSuccess(
      "account_lookup",
      "AMAZON_IDENTITY_FOUND",
      "An existing Amazon identity was found.",
    );
    return withAmazonCallbackStage(
      "session_creation",
      "The authenticated session could not be created.",
      () => completeSignIn({ id: identity.user.id, accountType }),
    );
  }

  const existingSameTypeUser = await withAmazonCallbackStage(
    "email_account_lookup",
    "The existing account could not be checked.",
    () =>
      prisma.user.findUnique({
        where: {
          accountType_normalizedEmail: {
            accountType,
            normalizedEmail: profile.email,
          },
        },
        select: { id: true },
      }),
  );
  if (existingSameTypeUser) {
    logAmazonCallbackFailure(
      "email_account_lookup",
      "AMAZON_EMAIL_ACCOUNT_CONFLICT",
      "An account with this email already exists and was not linked.",
    );
    return redirect("account_link_required", parsedState.locale, accountType);
  }
  logAmazonCallbackSuccess(
    "email_account_lookup",
    "AMAZON_EMAIL_AVAILABLE",
    "No conflicting account was found for this role.",
  );

  try {
    const user = await withAmazonCallbackStage(
      "account_creation",
      "The Amazon account could not be created.",
      () =>
        prisma.user.create({
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
        }),
    );
    return withAmazonCallbackStage(
      "session_creation",
      "The authenticated session could not be created.",
      () => completeSignIn({ ...user, accountType }),
    );
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

type AmazonCallbackStage =
  | "callback_received"
  | "authorization_start"
  | "state_validation"
  | "pkce_validation"
  | "authorization_response"
  | "configuration"
  | "token_exchange_and_profile_lookup"
  | "profile_lookup"
  | "profile_validation"
  | "account_lookup"
  | "email_account_lookup"
  | "account_validation"
  | "account_creation"
  | "session_creation";

async function withAmazonCallbackStage<T>(
  stage: AmazonCallbackStage,
  failureMessage: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    const result = await operation();
    console.info("[auth] Amazon OAuth callback stage completed", { stage });
    return result;
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : isPrismaErrorCode(error)
          ? error.code
          : "AMAZON_CALLBACK_STAGE_FAILED";
    logAmazonCallbackFailure(stage, code, failureMessage);
    throw error;
  }
}

function logAmazonCallbackFailure(
  stage: AmazonCallbackStage,
  code: string,
  message: string,
  details: Record<string, string | number | boolean> = {},
): void {
  console.error("[auth] Amazon OAuth callback stage failed", {
    stage,
    code,
    message,
    ...details,
  });
}

function logAmazonCallbackSuccess(
  stage: AmazonCallbackStage,
  code: string,
  message: string,
  details: Record<string, string | number | boolean> = {},
): void {
  console.info("[auth] Amazon OAuth callback stage completed", {
    stage,
    code,
    message,
    ...details,
  });
}

function isConfiguredBrowserOrigin(
  origin: string | null,
  configuredOrigin: string,
): boolean {
  if (!origin || origin === "null") return false;
  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.origin === origin &&
      parsedOrigin.origin === configuredOrigin
    );
  } catch {
    return false;
  }
}

function isPrismaErrorCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
  );
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
  } catch {
    logAmazonCallbackFailure(
      "token_exchange_and_profile_lookup",
      "AMAZON_TOKEN_EXCHANGE_UNAVAILABLE",
      "Amazon authorization could not be completed.",
    );
    throw new AppError(
      "AMAZON_TOKEN_EXCHANGE_UNAVAILABLE",
      503,
      "Amazon authorization could not be completed.",
    );
  }
  if (!tokenResponse.ok) {
    logAmazonCallbackFailure(
      "token_exchange_and_profile_lookup",
      "AMAZON_TOKEN_EXCHANGE_REJECTED",
      "Amazon rejected the authorization-code exchange.",
      { providerStatus: tokenResponse.status },
    );
    throw new AppError(
      "AMAZON_TOKEN_EXCHANGE_REJECTED",
      401,
      "Amazon authorization could not be completed.",
    );
  }

  const tokenResult = amazonTokenSchema.safeParse(
    await readJson(tokenResponse),
  );
  if (!tokenResult.success) {
    logAmazonCallbackFailure(
      "token_exchange_and_profile_lookup",
      "AMAZON_TOKEN_RESPONSE_INVALID",
      "Amazon returned an invalid token response.",
    );
    throw new AppError(
      "AMAZON_TOKEN_RESPONSE_INVALID",
      401,
      "Amazon authorization response was invalid.",
    );
  }
  console.info("[auth] Amazon OAuth callback stage completed", {
    stage: "token_exchange",
  });

  let profileResponse: Response;
  try {
    profileResponse = await fetch("https://api.amazon.com/user/profile", {
      headers: { authorization: `Bearer ${tokenResult.data.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    logAmazonCallbackFailure(
      "profile_lookup",
      "AMAZON_PROFILE_LOOKUP_UNAVAILABLE",
      "Amazon profile information could not be retrieved.",
    );
    throw new AppError(
      "AMAZON_PROFILE_LOOKUP_UNAVAILABLE",
      503,
      "Amazon profile information could not be retrieved.",
    );
  }
  if (!profileResponse.ok) {
    logAmazonCallbackFailure(
      "profile_lookup",
      "AMAZON_PROFILE_LOOKUP_REJECTED",
      "Amazon rejected the profile request.",
      { providerStatus: profileResponse.status },
    );
    throw new AppError(
      "AMAZON_PROFILE_LOOKUP_REJECTED",
      401,
      "Amazon profile information could not be retrieved.",
    );
  }

  const profileResult = amazonProfileSchema.safeParse(
    await readJson(profileResponse),
  );
  if (!profileResult.success) {
    logAmazonCallbackFailure(
      "profile_validation",
      "AMAZON_PROFILE_RESPONSE_INVALID",
      "Amazon profile information did not contain the required fields.",
      {
        invalidFieldCount: profileResult.error.issues.length,
      },
    );
    throw new AppError(
      "AMAZON_PROFILE_RESPONSE_INVALID",
      401,
      "Amazon profile information was invalid.",
    );
  }
  console.info("[auth] Amazon OAuth callback stage completed", {
    stage: "profile_validation",
  });
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
