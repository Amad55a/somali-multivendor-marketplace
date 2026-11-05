import nodemailer from "nodemailer";
import { getEmailConfig } from "@/config/env";
import { AppError } from "@/lib/errors/app-error";
import { createOneTimeCodeEmail } from "@/features/auth/email-templates";
import type { AccountType } from "../../../generated/prisma/client";

type CustomerOrVendor = Extract<AccountType, "CUSTOMER" | "VENDOR">;

function getEmailDeliveryConfig() {
  const config = getEmailConfig();
  if (
    !config.SMTP_HOST ||
    !config.SMTP_USER ||
    !config.SMTP_PASSWORD ||
    !config.SMTP_FROM
  ) {
    const missing = (
      ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const
    ).filter((key) => !config[key]);
    console.error("[config] Email delivery is missing required environment variables", {
      names: missing,
    });
    throw new AppError(
      "EMAIL_DELIVERY_UNAVAILABLE",
      503,
      "Email delivery is not configured.",
    );
  }

  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    password: config.SMTP_PASSWORD,
    from: config.SMTP_FROM,
  };
}

export function assertEmailDeliveryConfigured(): void {
  getEmailDeliveryConfig();
}

export async function sendOneTimeCode(
  email: string,
  code: string,
  purpose: "EMAIL_VERIFY" | "ADMIN_LOGIN" | "PASSWORD_RESET",
  expiresAt: Date,
  accountType?: CustomerOrVendor,
): Promise<void> {
  const config = getEmailDeliveryConfig();
  const message = createOneTimeCodeEmail(code, purpose, expiresAt, accountType);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
  });

  try {
    const result = await transporter.sendMail({
      from: config.from,
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.accepted.length === 0) {
      console.error("[auth] Email provider did not accept message", {
        rejectedCount: result.rejected.length,
      });
      throw new AppError(
        "EMAIL_DELIVERY_UNAVAILABLE",
        503,
        "Email delivery is temporarily unavailable.",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[auth] Email delivery failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
      ...(isSafeSmtpCode(error) ? { smtpCode: error.code } : {}),
      ...(isSafeSmtpResponseCode(error) ? { smtpResponseCode: error.responseCode } : {}),
    });
    throw new AppError(
      "EMAIL_DELIVERY_UNAVAILABLE",
      503,
      "Email delivery is temporarily unavailable.",
    );
  }
}

function isSafeSmtpCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{2,32}$/.test(error.code)
  );
}

function isSafeSmtpResponseCode(
  error: unknown,
): error is Error & { responseCode: number } {
  return (
    error instanceof Error &&
    "responseCode" in error &&
    typeof error.responseCode === "number" &&
    Number.isInteger(error.responseCode) &&
    error.responseCode >= 400 &&
    error.responseCode <= 599
  );
}
