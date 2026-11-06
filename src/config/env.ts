import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";

const optionalValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:\/\//i.test(value),
      "DATABASE_URL must use the PostgreSQL protocol",
    ),
});

const authEnvSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must contain at least 32 characters")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") >= 32,
      "AUTH_SECRET must contain at least 32 bytes",
    ),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_ISSUER: optionalValue,
  AUTH_AUDIENCE: z.string().trim().min(1).default("somali-marketplace-api"),
});

const smtpFromSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    const namedAddress = /^(?:"[^"\r\n]+"|[^<>\r\n]+)\s*<([^<>\s]+)>$/.exec(
      value,
    );
    const address = namedAddress?.[1] ?? value;
    return z.email().safeParse(address).success;
  }, "SMTP_FROM must be an email address or a display name with an email address");

const emailEnvSchema = z.object({
  SMTP_HOST: optionalValue,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: optionalValue,
  SMTP_PASSWORD: optionalValue,
  SMTP_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    smtpFromSchema.optional(),
  ),
});

const amazonEnvSchema = z.object({
  AMAZON_CLIENT_ID: optionalValue,
  AMAZON_CLIENT_SECRET: optionalValue,
  AMAZON_REDIRECT_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
});

const mfaEnvSchema = z.object({
  ADMIN_MFA_ENCRYPTION_KEY: z
    .string()
    .trim()
    .refine(
      isSupportedMfaEncryptionKey,
      "ADMIN_MFA_ENCRYPTION_KEY must encode exactly 32 bytes as 64 hexadecimal characters or 44 canonical Base64 characters",
    ),
});

const recaptchaEnvSchema = z.object({
  RECAPTCHA_SECRET_KEY: optionalValue,
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
});

function parseServerConfig<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  section: string,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.error("[config] Invalid server environment configuration", {
      section,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    });
    throw new AppError(
      "CONFIGURATION_UNAVAILABLE",
      503,
      "A required server configuration is invalid.",
    );
  }
  return parsed.data;
}

export function getDatabaseUrl(): string {
  return parseServerConfig(
    databaseEnvSchema,
    { DATABASE_URL: process.env.DATABASE_URL },
    "database",
  ).DATABASE_URL;
}

export function getAuthConfig() {
  const parsed = parseServerConfig(
    authEnvSchema,
    {
      AUTH_SECRET: process.env.AUTH_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      AUTH_ISSUER: process.env.AUTH_ISSUER,
      AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    },
    "authentication",
  );

  return {
    secret: new TextEncoder().encode(parsed.AUTH_SECRET),
    issuer: parsed.AUTH_ISSUER ?? new URL(parsed.NEXT_PUBLIC_APP_URL).origin,
    audience: parsed.AUTH_AUDIENCE,
    appUrl: parsed.NEXT_PUBLIC_APP_URL,
    secureCookies: process.env.NODE_ENV === "production",
  };
}

export function getEmailConfig() {
  return parseServerConfig(
    emailEnvSchema,
    {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD,
      SMTP_FROM: process.env.SMTP_FROM,
    },
    "email",
  );
}

export function getAmazonConfig() {
  const parsed = parseServerConfig(
    amazonEnvSchema,
    {
      AMAZON_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
      AMAZON_REDIRECT_URI: process.env.AMAZON_REDIRECT_URI,
    },
    "amazon",
  );

  const { AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REDIRECT_URI } = parsed;
  if (!AMAZON_CLIENT_ID && !AMAZON_CLIENT_SECRET && !AMAZON_REDIRECT_URI) {
    return null;
  }
  if (!AMAZON_CLIENT_ID || !AMAZON_CLIENT_SECRET || !AMAZON_REDIRECT_URI) {
    console.error("[config] Amazon sign-in configuration is incomplete", {
      missing: [
        !AMAZON_CLIENT_ID ? "AMAZON_CLIENT_ID" : null,
        !AMAZON_CLIENT_SECRET ? "AMAZON_CLIENT_SECRET" : null,
        !AMAZON_REDIRECT_URI ? "AMAZON_REDIRECT_URI" : null,
      ].filter((key): key is string => key !== null),
    });
    throw new AppError(
      "AMAZON_CONFIGURATION_UNAVAILABLE",
      503,
      "Amazon sign-in configuration is incomplete.",
    );
  }

  const callbackUrl = new URL(AMAZON_REDIRECT_URI);
  const callbackError =
    callbackUrl.protocol !== "https:"
      ? "callback_https_required"
      : callbackUrl.pathname !== "/api/v1/auth/amazon/callback"
        ? "callback_path_invalid"
        : callbackUrl.search || callbackUrl.hash
          ? "callback_must_not_include_query_or_fragment"
          : callbackUrl.origin !== new URL(getAuthConfig().appUrl).origin
            ? "callback_origin_mismatch"
            : null;
  if (callbackError) throw amazonCallbackConfigurationError(callbackError);

  return {
    clientId: AMAZON_CLIENT_ID,
    clientSecret: AMAZON_CLIENT_SECRET,
    redirectUri: AMAZON_REDIRECT_URI,
  };
}

function amazonCallbackConfigurationError(reason: string): AppError {
  console.error("[config] Amazon callback URL validation failed", { reason });
  return new AppError(
    "AMAZON_CONFIGURATION_UNAVAILABLE",
    503,
    "Amazon sign-in is unavailable because its callback URL is misconfigured.",
  );
}

export function getAdminMfaEncryptionKey(): Uint8Array {
  let parsed: z.output<typeof mfaEnvSchema>;
  try {
    parsed = parseServerConfig(
      mfaEnvSchema,
      { ADMIN_MFA_ENCRYPTION_KEY: process.env.ADMIN_MFA_ENCRYPTION_KEY },
      "administrator MFA",
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(
        "ADMIN_MFA_CONFIGURATION_INVALID",
        503,
        "ADMIN_MFA_ENCRYPTION_KEY must encode exactly 32 bytes using 64 hexadecimal characters or 44 canonical Base64 characters. Keep the same key material used to encrypt existing MFA secrets.",
      );
    }
    throw error;
  }

  return decodeMfaEncryptionKey(parsed.ADMIN_MFA_ENCRYPTION_KEY);
}

function isSupportedMfaEncryptionKey(value: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return true;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}

function decodeMfaEncryptionKey(value: string): Uint8Array {
  return /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
}

export function simulatedPaymentsAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.SIMULATED_PAYMENTS_ENABLED !== "false";
}

export function assertMockPaymentAdapterConfigured() {
  const adapter = process.env.SIMULATED_PAYMENT_ADAPTER ?? "mock";
  if (adapter !== "mock") {
    console.error("[config] Unsupported payment adapter selected", { adapter });
    throw new AppError(
      "PAYMENT_ADAPTER_UNAVAILABLE",
      503,
      "Only the mock payment adapter is available; no real payment provider is configured.",
    );
  }
}

export function getRecaptchaConfig() {
  const parsed = parseServerConfig(
    recaptchaEnvSchema,
    {
      RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
      RECAPTCHA_MIN_SCORE: process.env.RECAPTCHA_MIN_SCORE,
    },
    "reCAPTCHA",
  );

  if (!parsed.RECAPTCHA_SECRET_KEY) {
    console.error("[config] Missing required server environment variable", {
      name: "RECAPTCHA_SECRET_KEY",
    });
    throw new AppError(
      "CONFIGURATION_UNAVAILABLE",
      503,
      "Bot protection is not configured.",
    );
  }

  return {
    secretKey: parsed.RECAPTCHA_SECRET_KEY,
    minimumScore: parsed.RECAPTCHA_MIN_SCORE,
    expectedHostname: new URL(getAuthConfig().appUrl).hostname.toLowerCase(),
  };
}
