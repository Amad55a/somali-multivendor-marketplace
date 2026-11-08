import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { AccountType, Prisma, User } from "../../../generated/prisma/client";
import { getAuthConfig } from "@/config/env";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/features/auth/security";

const SESSION_COOKIE = "marketplace_session";
const PRODUCTION_SESSION_COOKIE = "__Host-marketplace_session";
const REFRESH_COOKIE = "marketplace_refresh";
const PRODUCTION_REFRESH_COOKIE = "__Host-marketplace_refresh";
const ADMIN_MAX_AGE_SECONDS = 24 * 60 * 60;
const USER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const USER_REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ADMIN_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
const USER_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

type SessionWriter = Pick<Prisma.TransactionClient, "userSession">;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName?: string | null;
  accountType: AccountType;
  emailVerifiedAt: Date | null;
  hasAmazonIdentity: boolean;
  hasProfilePhoto?: boolean;
  sessionId: string;
};

export type IssuedSession = {
  token: string;
  refreshToken: string;
  maxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
};

function cookieName(): string {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_SESSION_COOKIE
    : SESSION_COOKIE;
}

function refreshCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_REFRESH_COOKIE
    : REFRESH_COOKIE;
}

export function getSessionCookieNames() {
  return { access: cookieName(), refresh: refreshCookieName() };
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

export async function createSession(
  user: Pick<User, "id" | "accountType">,
  writer: SessionWriter = prisma,
): Promise<IssuedSession> {
  const sessionMaxAgeSeconds =
    user.accountType === "ADMIN" ? ADMIN_MAX_AGE_SECONDS : USER_MAX_AGE_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const accessExpiresAt = issuedAt + sessionMaxAgeSeconds;
  const refreshExpiresAt =
    issuedAt +
    (user.accountType === "ADMIN"
      ? ADMIN_REFRESH_MAX_AGE_SECONDS
      : USER_REFRESH_MAX_AGE_SECONDS);
  const jti = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const token = await signAccessToken(
    user.id,
    user.accountType,
    jti,
    issuedAt,
    accessExpiresAt,
  );

  await writer.userSession.create({
    data: {
      userId: user.id,
      sessionTokenHash: hashSecret(jti, "session-jti"),
      refreshTokenHash: hashSecret(refreshToken, "session-refresh"),
      lastActivityAt: new Date(issuedAt * 1000),
      expiresAt: new Date(accessExpiresAt * 1000),
      refreshExpiresAt: new Date(refreshExpiresAt * 1000),
    },
  });

  return {
    token,
    refreshToken,
    maxAgeSeconds: sessionMaxAgeSeconds,
    refreshMaxAgeSeconds:
      user.accountType === "ADMIN"
        ? ADMIN_REFRESH_MAX_AGE_SECONDS
        : USER_REFRESH_MAX_AGE_SECONDS,
  };
}

async function signAccessToken(
  userId: string,
  accountType: AccountType,
  jti: string,
  issuedAt: number,
  expiresAt: number,
): Promise<string> {
  const authConfig = getAuthConfig();
  return new SignJWT({ accountType })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(authConfig.issuer)
    .setAudience(authConfig.audience)
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(authConfig.secret);
}

export function setSessionCookie(
  response: Response,
  session: IssuedSession,
): Response {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${cookieName()}=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.maxAgeSeconds}${secure}`,
  );
  response.headers.append(
    "Set-Cookie",
    `${refreshCookieName()}=${session.refreshToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.refreshMaxAgeSeconds}${secure}`,
  );
  return response;
}

export function clearSessionCookie(response: Response): Response {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${cookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
  response.headers.append(
    "Set-Cookie",
    `${refreshCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
  return response;
}

export async function restoreExpiredSession(
  request: Request,
): Promise<{
  token: string;
  refreshToken: string;
  maxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
} | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const accessToken = sessionToken(cookies.get(cookieName()));
  const refreshToken = sessionToken(cookies.get(refreshCookieName()));
  if (!refreshToken) return null;

  let accessExpired = !accessToken;
  if (accessToken) {
    try {
      await jwtVerify(accessToken, getAuthConfig().secret, {
        issuer: getAuthConfig().issuer,
        audience: getAuthConfig().audience,
        algorithms: ["HS256"],
        clockTolerance: 5,
      });
      return null;
    } catch {
      accessExpired = true;
    }
  }
  if (!accessExpired) return null;

  const now = new Date();
  const session = await prisma.userSession.findUnique({
    where: { refreshTokenHash: hashSecret(refreshToken, "session-refresh") },
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    !session.refreshExpiresAt ||
    session.refreshExpiresAt <= now ||
    !session.user.isActive
  ) {
    return null;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const jti = randomBytes(32).toString("base64url");
  const nextRefreshToken = randomBytes(32).toString("base64url");
  const token = await signAccessToken(
    session.user.id,
    session.user.accountType,
    jti,
    issuedAt,
    issuedAt +
      (session.user.accountType === "ADMIN"
        ? ADMIN_MAX_AGE_SECONDS
        : USER_MAX_AGE_SECONDS),
  );
  const rotated = await prisma.userSession.updateMany({
    where: {
      id: session.id,
      refreshTokenHash: hashSecret(refreshToken, "session-refresh"),
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      sessionTokenHash: hashSecret(jti, "session-jti"),
      refreshTokenHash: hashSecret(nextRefreshToken, "session-refresh"),
      lastActivityAt: now,
      expiresAt: new Date(
        (issuedAt +
          (session.user.accountType === "ADMIN"
            ? ADMIN_MAX_AGE_SECONDS
            : USER_MAX_AGE_SECONDS)) *
          1000,
      ),
    },
  });
  return rotated.count === 1
    ? {
        token,
        refreshToken: nextRefreshToken,
        maxAgeSeconds:
          session.user.accountType === "ADMIN"
            ? ADMIN_MAX_AGE_SECONDS
            : USER_MAX_AGE_SECONDS,
        refreshMaxAgeSeconds:
          session.user.accountType === "ADMIN"
            ? ADMIN_REFRESH_MAX_AGE_SECONDS
            : USER_REFRESH_MAX_AGE_SECONDS,
      }
    : null;
}

function sessionToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export async function getOptionalCustomer(request: Request): Promise<AuthenticatedUser | null> {
  try {
    return await requireUser(request, ["CUSTOMER"]);
  } catch (error) {
    if (error instanceof AppError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

export async function requireUser(
  request: Request,
  allowedTypes?: readonly AccountType[],
  options: { updateActivity?: boolean } = {},
): Promise<AuthenticatedUser> {
  const token = sessionToken(parseCookies(request.headers.get("cookie")).get(cookieName()));
  if (!token) {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required.");
  }

  const authConfig = getAuthConfig();
  let claims;
  try {
    const verified = await jwtVerify(token, authConfig.secret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      algorithms: ["HS256"],
      clockTolerance: 5,
    });
    claims = verified.payload;
  } catch {
    throw new AppError("UNAUTHENTICATED", 401, "The session is invalid or expired.");
  }

  if (
    typeof claims.sub !== "string" ||
    typeof claims.jti !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    !isAccountType(claims.accountType)
  ) {
    throw new AppError("UNAUTHENTICATED", 401, "The session is invalid or expired.");
  }

  const sessionHash = hashSecret(claims.jti, "session-jti");
  const session = await prisma.userSession.findUnique({
    where: { sessionTokenHash: sessionHash },
    include: {
      user: {
        include: {
          authAccounts: {
            where: { provider: "AMAZON" },
            select: { id: true },
          },
        },
      },
    },
  });

  const now = new Date();
  const inactivityLimit =
    session?.user.accountType === "ADMIN"
      ? ADMIN_INACTIVITY_MS
      : USER_INACTIVITY_MS;
  if (
    !session ||
    session.userId !== claims.sub ||
    session.user.accountType !== claims.accountType ||
    !session.user.isActive ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.expiresAt.getTime() !== claims.exp * 1000 ||
    now.getTime() - session.lastActivityAt.getTime() > inactivityLimit
  ) {
    if (session && !session.revokedAt) {
      await prisma.userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    throw new AppError("UNAUTHENTICATED", 401, "The session is invalid or expired.");
  }

  if (allowedTypes && !allowedTypes.includes(session.user.accountType)) {
    throw new AppError("FORBIDDEN", 403, "You do not have permission to access this resource.");
  }

  if (options.updateActivity !== false) {
    const activityUpdate = await prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastActivityAt: now },
    });
    if (activityUpdate.count !== 1) {
      throw new AppError("UNAUTHENTICATED", 401, "The session is invalid or expired.");
    }
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    accountType: session.user.accountType,
    emailVerifiedAt: session.user.emailVerifiedAt,
    hasAmazonIdentity: session.user.authAccounts.length > 0,
    hasProfilePhoto: Boolean(session.user.profileImageKey),
    sessionId: session.id,
  };
}

export async function revokeCurrentSession(
  request: Request,
  user: AuthenticatedUser,
): Promise<void> {
  const token = parseCookies(request.headers.get("cookie")).get(cookieName());
  if (!token) return;

  let jti: string | undefined;
  try {
    const { payload } = await jwtVerify(token, getAuthConfig().secret, {
      issuer: getAuthConfig().issuer,
      audience: getAuthConfig().audience,
      algorithms: ["HS256"],
    });
    jti = payload.jti;
  } catch {
    return;
  }

  if (typeof jti !== "string") return;
  await prisma.userSession.updateMany({
    where: {
      id: user.sessionId,
      userId: user.id,
      sessionTokenHash: hashSecret(jti, "session-jti"),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

function isAccountType(value: unknown): value is AccountType {
  return value === "CUSTOMER" || value === "VENDOR" || value === "ADMIN";
}
