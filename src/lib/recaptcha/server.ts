import { z } from "zod";
import { getRecaptchaConfig } from "@/config/env";
import { AppError } from "@/lib/errors/app-error";

const verificationResponseSchema = z.object({
  success: z.boolean(),
  score: z.number().optional(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

const safeGoogleErrorCodes = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
]);

export async function verifyRecaptchaToken(
  token: string,
  expectedAction: string,
): Promise<void> {
  let config: ReturnType<typeof getRecaptchaConfig>;
  try {
    config = getRecaptchaConfig();
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[recaptcha] Server configuration is invalid", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    throw new AppError(
      "CAPTCHA_UNAVAILABLE",
      503,
      "Bot protection is temporarily unavailable.",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: config.secretKey,
        response: token,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(
      "CAPTCHA_UNAVAILABLE",
      503,
      "Bot protection is temporarily unavailable.",
    );
  }

  if (!response.ok) {
    throw new AppError(
      "CAPTCHA_UNAVAILABLE",
      503,
      "Bot protection is temporarily unavailable.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError(
      "CAPTCHA_UNAVAILABLE",
      503,
      "Bot protection is temporarily unavailable.",
    );
  }

  const result = verificationResponseSchema.safeParse(payload);
  if (!result.success) {
    console.warn("[recaptcha] Google returned an invalid verification response", {
      reason: "malformed_response",
    });
    throw new AppError(
      "CAPTCHA_REJECTED",
      403,
      "Bot verification failed. Please try again.",
    );
  }

  const data = result.data;
  const failureReason = !data.success
    ? "google_rejected"
    : data.action !== expectedAction
      ? "action_mismatch"
      : data.hostname?.toLowerCase() !== config.expectedHostname
        ? "hostname_mismatch"
        : typeof data.score !== "number" ||
            data.score < 0 ||
            data.score > 1
          ? "score_invalid"
          : data.score < config.minimumScore
            ? "score_below_threshold"
            : null;

  if (failureReason) {
    console.warn("[recaptcha] Verification rejected", {
      reason: failureReason,
      googleSuccess: data.success,
      googleErrorCodesPresent: Array.isArray(data["error-codes"]),
      googleErrorCodes: (data["error-codes"] ?? []).filter((code) =>
        safeGoogleErrorCodes.has(code),
      ),
      actionMatches: data.action === expectedAction,
      hostnameMatches:
        data.hostname?.toLowerCase() === config.expectedHostname,
      scoreMeetsThreshold:
        typeof data.score === "number" &&
        data.score >= config.minimumScore &&
        data.score <= 1,
    });
    throw new AppError(
      "CAPTCHA_REJECTED",
      403,
      "Bot verification failed. Please try again.",
    );
  }
}
