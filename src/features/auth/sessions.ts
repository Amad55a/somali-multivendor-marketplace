import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { AccountType, Prisma, User } from "../../../generated/prisma/client";
import { getAuthConfig } from "@/config/env";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/features/auth/security";

const SESSION_COOKIE = "marketplace_session";
const PRODUCTION_SESSION_COOKIE = "__Host-marketplace_session";
const ADMIN_MAX_AGE_SECONDS = 24 * 60 * 60;
const USER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_INACTIVITY_MS = 10 * 60 * 1000;
const USER_INACTIVITY_MS = 24 * 60 * 60 * 1000;

type SessionWriter = Pick<Prisma.TransactionClient, "userSession">;

export type AuthenticatedUser = {
  id: string;
  email: string;
  accountType: AccountType;
  emailVerifiedAt: Date | null;
  hasAmazonIdentity: boolean;
  sessionId: string;
};

export type IssuedSession = {
  token: string;
  maxAgeSeconds: number;
};

function cookieName(): string {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_SESSION_COOKIE
    : SESSION_COOKIE;
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
  const authConfig = getAuthConfig();
  const maxAgeSeconds =
    user.accountType === "ADMIN" ? ADMIN_MAX_AGE_SECONDS : USER_MAX_AGE_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + maxAgeSeconds;
  const jti = randomBytes(32).toString("base64url");
  const token = await new SignJWT({ accountType: user.accountType })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(authConfig.issuer)
    .setAudience(authConfig.audience)
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(authConfig.secret);

  await writer.userSession.create({
    data: {
      userId: user.id,
      sessionTokenHash: hashSecret(jti, "session-jti"),
      lastActivityAt: new Date(issuedAt * 1000),
      expiresAt: new Date(expiresAt * 1000),
    },
  });

  return { token, maxAgeSeconds };
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
  return response;
}

export function clearSessionCookie(response: Response): Response {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${cookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
  return response;
}

export async function requireUser(
  request: Request,
  allowedTypes?: readonly AccountType[],
): Promise<AuthenticatedUser> {
  const token = parseCookies(request.headers.get("cookie")).get(cookieName());
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

  const activityUpdate = await prisma.userSession.updateMany({
    where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
    data: { lastActivityAt: now },
  });
  if (activityUpdate.count !== 1) {
    throw new AppError("UNAUTHENTICATED", 401, "The session is invalid or expired.");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    accountType: session.user.accountType,
    emailVerifiedAt: session.user.emailVerifiedAt,
    hasAmazonIdentity: session.user.authAccounts.length > 0,
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
