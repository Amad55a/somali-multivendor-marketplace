import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSession: { create: vi.fn() },
    userAuthAccount: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { jwtVerify } from "jose";
import { getAuthConfig } from "@/config/env";
import {
  createAmazonOAuthState,
  completeAmazonLogin,
  verifyAmazonOAuthState,
} from "@/features/auth/amazon";
import {
  getPendingEmailVerification,
  setPendingEmailVerificationCookie,
} from "@/features/auth/pending-email-verification";
import { hashPassword, verifyPassword } from "@/features/auth/passwords";
import { createSession } from "@/features/auth/sessions";
import { loginSchema, applicationPatchSchema } from "@/features/auth/validation/schemas";
import { assertSameOrigin, parseJson } from "@/lib/api/requests";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";

const userId = "807c363a-20a5-4db4-bf03-7ae5bf51a9d2";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-only-auth-secret-that-is-long-enough-for-tests");
  vi.stubEnv("AUTH_ISSUER", "https://marketplace.example");
  vi.stubEnv("AUTH_AUDIENCE", "marketplace-tests");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NODE_ENV", "test");
  vi.mocked(prisma.userSession.create).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("JWT sessions", () => {
  it("signs one access JWT with required claims and stores only a session hash", async () => {
    const issued = await createSession({ id: userId, accountType: "CUSTOMER" });
    const verified = await jwtVerify(issued.token, getAuthConfig().secret, {
      issuer: getAuthConfig().issuer,
      audience: getAuthConfig().audience,
      algorithms: ["HS256"],
    });

    expect(verified.payload).toMatchObject({
      sub: userId,
      accountType: "CUSTOMER",
    });
    expect(verified.payload.jti).toEqual(expect.any(String));
    expect(verified.payload.iat).toEqual(expect.any(Number));
    expect(verified.payload.exp).toEqual(expect.any(Number));
    expect(issued.maxAgeSeconds).toBe(7 * 24 * 60 * 60);

    const stored = vi.mocked(prisma.userSession.create).mock.calls[0]?.[0].data;
    expect(stored?.sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.sessionTokenHash).not.toContain(issued.token);
    expect(new Date(stored?.expiresAt ?? 0).getTime()).toBe(
      verified.payload.exp! * 1000,
    );
  });

  it("uses the admin absolute lifetime", async () => {
    const issued = await createSession({ id: userId, accountType: "ADMIN" });

    expect(issued.maxAgeSeconds).toBe(24 * 60 * 60);
    await expect(
      jwtVerify(issued.token, getAuthConfig().secret, {
        issuer: getAuthConfig().issuer,
        audience: getAuthConfig().audience,
      }),
    ).resolves.toMatchObject({ payload: { accountType: "ADMIN" } });
  });
});

describe("pending email verification cookie", () => {
  it("binds verification to a signed customer or vendor registration", () => {
    const response = setPendingEmailVerificationCookie(
      new Response(null),
      userId,
      "VENDOR",
    );
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Pending verification cookie was not set.");
    expect(
      getPendingEmailVerification(
        new Request("http://localhost:3000", {
          headers: { cookie },
        }),
      ),
    ).toEqual({ userId, accountType: "VENDOR" });
    expect(
      getPendingEmailVerification(
        new Request("http://localhost:3000", {
          headers: { cookie: `${cookie}tampered` },
        }),
      ),
    ).toBeNull();
  });
});

describe("password and request boundaries", () => {
  it("hashes passwords with Argon2id and rejects an incorrect password", async () => {
    const hash = await hashPassword("somali-marketplace-password");

    expect(hash).toContain("$argon2id$");
    await expect(verifyPassword(hash, "somali-marketplace-password")).resolves.toBe(true);
    await expect(verifyPassword(hash, "different-password")).resolves.toBe(false);
  });

  it("requires customer or vendor account type and rejects client privilege fields", () => {
    expect(
      loginSchema.safeParse({
        email: "customer@example.com",
        password: "correct-horse-battery-staple",
        accountType: "ADMIN",
      }).success,
    ).toBe(false);
    expect(
      applicationPatchSchema.safeParse({
        storeName: "Dukaan",
        applicationStatus: "APPROVED",
      }).success,
    ).toBe(false);
  });

  it("validates JSON content type, size, and schema at the API boundary", async () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "correct-horse-battery-staple",
        accountType: "CUSTOMER",
      }),
    });
    await expect(parseJson(request, loginSchema)).resolves.toMatchObject({
      accountType: "CUSTOMER",
    });

    const invalidRequest = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    await expect(parseJson(invalidRequest, loginSchema)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects cross-origin cookie-authenticated mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/v1/auth/logout", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrowError(AppError);
  });
});

describe("Amazon OAuth state", () => {
  it("signs the chosen account type and rejects a callback state mismatch", async () => {
    const state = createAmazonOAuthState("VENDOR");
    expect(verifyAmazonOAuthState(state, state)).toEqual({
      accountType: "VENDOR",
      locale: "en",
    });
    expect(verifyAmazonOAuthState(`${state}x`, state)).toBeNull();
    expect(verifyAmazonOAuthState(state, null)).toBeNull();

    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await completeAmazonLogin(
      new Request(
        `http://localhost/api/v1/auth/amazon/callback?code=opaque&state=${encodeURIComponent(`${state}x`)}`,
        { headers: { cookie: `marketplace_amazon_state=${state}` } },
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("amazon_failed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
