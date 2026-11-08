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
  startAmazonLogin,
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
  it("keeps the PKCE verifier with the state cookie and sends it during exchange", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://localhost:3000");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://localhost:3000/api/v1/auth/amazon/callback",
    );

    const start = startAmazonLogin("VENDOR");
    const authorizationUrl = new URL(start.headers.get("location") ?? "");
    const state = authorizationUrl.searchParams.get("state");
    const setCookie = start.headers.get("set-cookie");
    if (!state || !setCookie) throw new Error("Amazon OAuth cookies were not set.");
    expect(setCookie).toContain("__Host-marketplace_amazon_state=");
    expect(setCookie).not.toContain("marketplace_amazon_pkce=");

    const cookie = setCookie.split(";")[0];
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      completeAmazonLogin(
        new Request(
          `https://localhost:3000/api/v1/auth/amazon/callback?code=opaque&state=${encodeURIComponent(state)}`,
          { headers: { cookie } },
        ),
      ),
    ).rejects.toMatchObject({ code: "AMAZON_TOKEN_EXCHANGE_REJECTED" });

    const tokenBody = fetch.mock.calls[0]?.[1]?.body;
    expect(tokenBody).toBeInstanceOf(URLSearchParams);
    if (!(tokenBody instanceof URLSearchParams)) {
      throw new Error("Amazon token request did not use form data.");
    }
    expect(tokenBody.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.amazon.com/auth/o2/token");
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(authorizationUrl.searchParams.get("scope")).toBe("profile");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://localhost:3000/api/v1/auth/amazon/callback",
    );
  });

  it("accepts an in-flight callback using the previous separate PKCE cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://localhost:3000");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://localhost:3000/api/v1/auth/amazon/callback",
    );

    const start = startAmazonLogin("VENDOR");
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state");
    const cookieHeader = start.headers.get("set-cookie");
    if (!state || !cookieHeader) throw new Error("Amazon OAuth cookies were not set.");
    const combinedCookie = cookieHeader.split(";")[0];
    const separator = combinedCookie.lastIndexOf("~");
    const cookieName = combinedCookie.slice(0, combinedCookie.indexOf("="));
    const cookieValue = combinedCookie.slice(combinedCookie.indexOf("=") + 1);
    const verifier = cookieValue.slice(separator + 1);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      completeAmazonLogin(
        new Request(
          `https://localhost:3000/api/v1/auth/amazon/callback?code=opaque&state=${encodeURIComponent(state)}`,
          {
            headers: {
              cookie: `${cookieName}=${state}; __Host-marketplace_amazon_pkce=${verifier}`,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "AMAZON_TOKEN_EXCHANGE_REJECTED" });

    const tokenBody = fetch.mock.calls[0]?.[1]?.body;
    expect(tokenBody).toBeInstanceOf(URLSearchParams);
    if (!(tokenBody instanceof URLSearchParams)) {
      throw new Error("Amazon token request did not use form data.");
    }
    expect(tokenBody.get("code_verifier")).toBe(verifier);
  });

  it("rejects Amazon sign-in started from a host that cannot receive its callback cookie", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shop.example.test");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://shop.example.test/api/v1/auth/amazon/callback",
    );

    expect(() =>
      startAmazonLogin(
        "VENDOR",
        "en",
        new Request("http://localhost:3000/api/v1/auth/amazon", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "x-forwarded-host": "shop.example.test",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "AMAZON_CALLBACK_ORIGIN_MISMATCH" }),
    );
  });

  it("accepts the configured browser origin behind a reverse proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shop.example.test");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://shop.example.test/api/v1/auth/amazon/callback",
    );

    const response = startAmazonLogin(
      "VENDOR",
      "en",
      new Request("http://internal-service:3000/api/v1/auth/amazon", {
        method: "POST",
        headers: {
          origin: "https://shop.example.test",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "http",
        },
      }),
    );
    const authorizationUrl = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://shop.example.test/api/v1/auth/amazon/callback",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "__Host-marketplace_amazon_state=",
    );
  });

  it("supports HTTPS localhost when both application and callback URLs use it", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://localhost:3000");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://localhost:3000/api/v1/auth/amazon/callback",
    );

    const response = startAmazonLogin(
      "CUSTOMER",
      "en",
      new Request("http://internal-service:3000/api/v1/auth/amazon", {
        method: "POST",
        headers: { origin: "https://localhost:3000" },
      }),
    );

    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "redirect_uri",
      ),
    ).toBe("https://localhost:3000/api/v1/auth/amazon/callback");
  });

  it("signs the chosen account type and rejects a callback state mismatch", async () => {
    const state = createAmazonOAuthState("VENDOR");
    const callbackLog = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(callbackLog).toHaveBeenCalledWith(
      "[auth] Amazon OAuth callback stage failed",
      expect.objectContaining({
        stage: "state_validation",
        code: "AMAZON_STATE_MISMATCH",
        requestOriginMatchesConfiguredOrigin: false,
      }),
    );
    expect(JSON.stringify(callbackLog.mock.calls)).not.toContain(state);
  });
});
