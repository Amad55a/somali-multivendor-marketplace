import { randomInt } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import type { AccountType } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/features/auth/security";
import {
  assertEmailDeliveryConfigured,
  sendOneTimeCode,
} from "@/features/auth/email";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
type CustomerOrVendor = Extract<AccountType, "CUSTOMER" | "VENDOR">;

export async function issueEmailCode(
  userId: string,
  email: string,
  purpose: "EMAIL_VERIFY" | "ADMIN_LOGIN" | "PASSWORD_RESET",
  accountType?: CustomerOrVendor,
): Promise<void> {
  assertEmailDeliveryConfigured();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();

  const record = await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
    return transaction.emailVerificationCode.create({
      data: {
        userId,
        purpose,
        codeHash: hashSecret(code, `email-code:${userId}:${purpose}`),
        expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      },
    });
  });

  try {
    await sendOneTimeCode(
      email,
      code,
      purpose,
      record.expiresAt,
      accountType,
    );
  } catch (error) {
    try {
      await prisma.emailVerificationCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    } catch (cleanupError) {
      console.error("[auth] Failed to invalidate an undelivered verification code", {
        errorName:
          cleanupError instanceof Error ? cleanupError.name : "Unknown",
      });
    }
    throw error;
  }
}

export async function consumeEmailCode(
  userId: string,
  purpose: "EMAIL_VERIFY" | "ADMIN_LOGIN" | "PASSWORD_RESET",
  code: string,
  transaction: Pick<Prisma.TransactionClient, "emailVerificationCode"> = prisma,
): Promise<boolean> {
  const now = new Date();
  const record = await transaction.emailVerificationCode.findFirst({
    where: {
      userId,
      purpose,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return false;

  const expected = hashSecret(code, `email-code:${userId}:${purpose}`);
  if (!constantTimeEqual(record.codeHash, expected)) return false;

  const result = await transaction.emailVerificationCode.updateMany({
    where: {
      id: record.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
  return result.count === 1;
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
