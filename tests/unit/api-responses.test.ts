import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorResponse, apiSuccessResponse } from "../../src/lib/api/responses";
import { AppError } from "../../src/lib/errors/app-error";
import {
  getAdminMfaEncryptionKey,
  getDatabaseUrl,
} from "../../src/config/env";
import { createValidationError } from "../../src/lib/api/requests";
import { z } from "zod";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("API response helpers", () => {
  it("wraps successful data in the standard response envelope", async () => {
    const response = apiSuccessResponse({ id: "user-1" }, 201);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: "user-1" },
    });
  });

  it("preserves safe application errors", async () => {
    const response = apiErrorResponse(
      new AppError("NOT_FOUND", 404, "The requested resource was not found."),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  it("reports a database schema mismatch without assuming migrations are pending", async () => {
    const error = Object.assign(new Error("table does not exist"), { code: "P2021" });
    const response = apiErrorResponse(error);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "DATABASE_SCHEMA_OUTDATED",
        message: "The database schema is incompatible with this application version.",
      },
    });
  });

  it("returns field-only validation details", async () => {
    const schema = z.object({ password: z.string().min(12) }).strict();
    const parsed = schema.safeParse({ password: "short", privateValue: "do-not-return" });
    if (parsed.success) throw new Error("Expected validation to fail.");

    const response = apiErrorResponse(createValidationError(parsed.error));
    const payload = await response.json();

    expect(payload).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed. See error.details for invalid fields.",
        details: [
          { path: "password", code: "too_small" },
          { path: "privateValue", code: "unrecognized_keys" },
        ],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("do-not-return");
  });

  it("hides unexpected error details and logs a sanitized diagnostic", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiErrorResponse(new Error("sensitive database detail"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
      },
    });
    expect(logError).toHaveBeenCalledWith("[api] Unhandled error", {
      errorName: "Error",
    });
  });

  it("accepts only PostgreSQL database URLs", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5432/marketplace");

    expect(getDatabaseUrl()).toBe(
      "postgresql://user:password@localhost:5432/marketplace",
    );

    vi.stubEnv("DATABASE_URL", "https://example.com");

    expect(() => getDatabaseUrl()).toThrow();
  });

  it("decodes 32-byte administrator MFA keys from hex or canonical Base64", () => {
    const expected = Buffer.alloc(32, 7);
    vi.stubEnv("ADMIN_MFA_ENCRYPTION_KEY", expected.toString("hex"));
    expect(Buffer.from(getAdminMfaEncryptionKey())).toEqual(expected);

    vi.stubEnv("ADMIN_MFA_ENCRYPTION_KEY", expected.toString("base64"));
    expect(Buffer.from(getAdminMfaEncryptionKey())).toEqual(expected);
  });

  it("reports the required administrator MFA key format safely", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ADMIN_MFA_ENCRYPTION_KEY", "invalid");

    expect(() => getAdminMfaEncryptionKey()).toThrow(
      "ADMIN_MFA_ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  });
});
