import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import { Prisma, type User } from "../../../generated/prisma/client";
import { getAdminMfaEncryptionKey } from "@/config/env";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { consumeEmailCode, issueEmailCode } from "@/features/auth/otp";
import { hashPassword, verifyPassword } from "@/features/auth/passwords";
import { hashSecret } from "@/features/auth/security";
import { createSession } from "@/features/auth/sessions";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyPasswordHash;
}

export async function beginAdminLogin(
  email: string,
  password: string,
): Promise<{ accepted: true }> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType: "ADMIN",
        normalizedEmail,
      },
    },
    include: {
      authAccounts: {
        where: { provider: "LOCAL" },
        select: { passwordHash: true },
      },
    },
  });
  const passwordHash =
    user?.authAccounts[0]?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(passwordHash, password);

  if (
    !user ||
    !user.isActive ||
    !user.emailVerifiedAt ||
    !passwordMatches ||
    !user.authAccounts[0]?.passwordHash
  ) {
    throw new AppError(
      "INVALID_CREDENTIALS",
      401,
      "Email or password is incorrect.",
    );
  }

  await issueEmailCode(user.id, user.email, "ADMIN_LOGIN");
  return { accepted: true };
}

export async function verifyAdminEmail(
  email: string,
  code: string,
): Promise<{ challengeId: string; mfaRequired: boolean }> {
  const user = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType: "ADMIN",
        normalizedEmail: email.trim().toLowerCase(),
      },
    },
  });
  if (!user || !user.isActive || !user.emailVerifiedAt) {
    throw invalidAdminCode();
  }

  const challengeId = randomBytes(32).toString("base64url");
  const now = new Date();
  const challenge = await prisma.$transaction(async (transaction) => {
    const consumed = await consumeEmailCode(
      user.id,
      "ADMIN_LOGIN",
      code,
      transaction,
    );
    if (!consumed) return false;

    await transaction.adminLoginChallenge.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await transaction.adminLoginChallenge.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(challengeId, "admin-login-challenge"),
        expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
      },
    });
    return true;
  });
  if (!challenge) throw invalidAdminCode();

  const method = await prisma.adminMfaMethod.findUnique({
    where: { userId: user.id },
    select: { enabled: true },
  });
  return { challengeId, mfaRequired: method?.enabled ?? false };
}

export async function setupAdminMfa(
  challengeId: string,
  secret: string,
): Promise<{ setup: true }> {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const challenge = await transaction.adminLoginChallenge.findUnique({
      where: { tokenHash: hashSecret(challengeId, "admin-login-challenge") },
      include: { user: true },
    });
    if (!isValidChallenge(challenge, now)) throw invalidAdminChallenge();

    const method = await transaction.adminMfaMethod.findUnique({
      where: { userId: challenge.userId },
    });
    if (method?.enabled) {
      throw new AppError("MFA_ALREADY_ENABLED", 409, "Administrator MFA is already enabled.");
    }

    const encryptedSecret = encryptSecret(secret);
    if (method) {
      const updated = await transaction.adminMfaMethod.updateMany({
        where: { userId: challenge.userId, enabled: false },
        data: { encryptedSecret, verifiedAt: null },
      });
      if (updated.count !== 1) throw invalidAdminChallenge();
    } else {
      await transaction.adminMfaMethod.create({
        data: { userId: challenge.userId, encryptedSecret },
      });
    }
  });

  return { setup: true };
}

export async function enableAdminMfa(
  challengeId: string,
  code: string,
) {
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const challenge = await transaction.adminLoginChallenge.findUnique({
      where: { tokenHash: hashSecret(challengeId, "admin-login-challenge") },
      include: { user: true },
    });
    if (!isValidChallenge(challenge, now)) throw invalidAdminChallenge();

    const method = await transaction.adminMfaMethod.findUnique({
      where: { userId: challenge.userId },
    });
    if (!method || method.enabled || !isTotpValid(method.encryptedSecret, code, challenge.user.email)) {
      throw invalidMfaCode();
    }

    const usedChallenge = await transaction.adminLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (usedChallenge.count !== 1) throw invalidAdminChallenge();

    await transaction.adminMfaMethod.update({
      where: { userId: challenge.userId },
      data: { enabled: true, verifiedAt: now },
    });
    await transaction.adminRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userId: challenge.userId,
        codeHash: hashSecret(
          recoveryCode.replaceAll("-", ""),
          `admin-recovery:${challenge.userId}`,
        ),
      })),
    });
    const session = await createSession(challenge.user, transaction);
    return {
      session,
      recoveryCodes,
      user: safeAdmin(challenge.user),
    };
  });
}

export async function verifyAdminMfa(challengeId: string, code: string) {
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const challenge = await transaction.adminLoginChallenge.findUnique({
      where: { tokenHash: hashSecret(challengeId, "admin-login-challenge") },
      include: { user: true },
    });
    if (!isValidChallenge(challenge, now)) throw invalidAdminChallenge();

    const method = await transaction.adminMfaMethod.findUnique({
      where: { userId: challenge.userId },
    });
    if (!method?.enabled || !challenge.user.isActive) {
      throw new AppError("MFA_SETUP_REQUIRED", 409, "Administrator MFA must be enabled first.");
    }

    let recoveryCodeId: string | null = null;
    if (/^\d{6}$/.test(code)) {
      if (!isTotpValid(method.encryptedSecret, code, challenge.user.email)) {
        throw invalidMfaCode();
      }
    } else {
      recoveryCodeId = await findRecoveryCode(transaction, challenge.userId, code);
      if (!recoveryCodeId) throw invalidMfaCode();

      const consumed = await transaction.adminRecoveryCode.updateMany({
        where: { id: recoveryCodeId, userId: challenge.userId, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalidMfaCode();
    }

    const consumedChallenge = await transaction.adminLoginChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumedChallenge.count !== 1) throw invalidAdminChallenge();

    const session = await createSession(challenge.user, transaction);
    return { session, user: safeAdmin(challenge.user) };
  });
}

function isValidChallenge(
  challenge: {
    expiresAt: Date;
    usedAt: Date | null;
    user: User;
  } | null,
  now: Date,
): challenge is NonNullable<typeof challenge> {
  return Boolean(
    challenge &&
      challenge.user.accountType === "ADMIN" &&
      challenge.user.isActive &&
      challenge.user.emailVerifiedAt &&
      !challenge.usedAt &&
      challenge.expiresAt > now,
  );
}

async function findRecoveryCode(
  transaction: Prisma.TransactionClient,
  userId: string,
  code: string,
): Promise<string | null> {
  const normalizedCode = code.replaceAll("-", "").toUpperCase();
  const hashes = await transaction.adminRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  const expected = hashSecret(normalizedCode, `admin-recovery:${userId}`);
  return hashes.find((entry) => constantTimeEqual(entry.codeHash, expected))?.id ?? null;
}

function createRecoveryCode(): string {
  const bytes = randomBytes(16).toString("hex").toUpperCase();
  return bytes.match(/.{1,8}/g)?.join("-") ?? bytes;
}

function encryptSecret(secret: string): string {
  const key = getAdminMfaEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(encryptedSecret: string): string {
  const [ivValue, tagValue, ciphertextValue] = encryptedSecret.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw storedMfaSecretUnavailable();
  }

  const key = getAdminMfaEncryptionKey();
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw storedMfaSecretUnavailable();
  }
}

function isTotpValid(
  encryptedSecret: string,
  token: string,
  email: string,
): boolean {
  const secret = decryptSecret(encryptedSecret);
  let totp: OTPAuth.TOTP;
  try {
    totp = new OTPAuth.TOTP({
      issuer: "Somsuuq",
      label: email,
      secret: OTPAuth.Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    });
  } catch {
    throw storedMfaSecretUnavailable();
  }
  return totp.validate({ token, window: 1 }) !== null;
}

function storedMfaSecretUnavailable(): AppError {
  return new AppError(
    "ADMIN_MFA_SECRET_UNAVAILABLE",
    503,
    "The stored administrator MFA secret could not be decrypted. Confirm that ADMIN_MFA_ENCRYPTION_KEY matches the key used during enrollment; do not rotate it.",
  );
}

function safeAdmin(user: User) {
  return {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function invalidAdminCode(): AppError {
  return new AppError("INVALID_ADMIN_CHALLENGE", 400, "The sign-in challenge is invalid or expired.");
}

function invalidAdminChallenge(): AppError {
  return new AppError("INVALID_ADMIN_CHALLENGE", 400, "The sign-in challenge is invalid or expired.");
}

function invalidMfaCode(): AppError {
  return new AppError("INVALID_MFA_CODE", 400, "The MFA code is invalid.");
}
