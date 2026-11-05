import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import type { AccountType } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { assertEmailDeliveryConfigured } from "@/features/auth/email";
import {
  consumeEmailCode,
  issueEmailCode,
} from "@/features/auth/otp";
import { hashPassword, verifyPassword } from "@/features/auth/passwords";
import {
  createSession,
  revokeCurrentSession,
  type AuthenticatedUser,
} from "@/features/auth/sessions";

type CustomerOrVendor = Extract<AccountType, "CUSTOMER" | "VENDOR">;

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyPasswordHash;
}

function invalidCredentials(): AppError {
  return new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
}

function invalidCode(): AppError {
  return new AppError("INVALID_VERIFICATION_CODE", 400, "The verification code is invalid or expired.");
}

export async function register(
  accountType: CustomerOrVendor,
  email: string,
  password: string,
) {
  assertEmailDeliveryConfigured();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const existingUser = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType,
        normalizedEmail,
      },
    },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(
      "ACCOUNT_ALREADY_EXISTS",
      409,
      "An account with these details cannot be created.",
    );
  }

  let user: { id: string; email: string; accountType: AccountType };
  try {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        normalizedEmail,
        accountType,
        authAccounts: {
          create: {
            provider: "LOCAL",
            passwordHash,
          },
        },
      },
      select: { id: true, email: true, accountType: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "ACCOUNT_ALREADY_EXISTS",
        409,
        "An account with these details cannot be created.",
      );
    }
    throw error;
  }

  try {
    await issueEmailCode(user.id, user.email, "EMAIL_VERIFY", accountType);
  } catch (error) {
    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch (cleanupError) {
      console.error("[auth] Failed to remove account after verification email failure", {
        errorName:
          cleanupError instanceof Error ? cleanupError.name : "Unknown",
      });
    }
    throw error;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      emailVerified: false,
    },
  };
}

export async function login(
  email: string,
  password: string,
  accountType: CustomerOrVendor,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType,
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
  if (!user || !passwordMatches || !user.isActive) throw invalidCredentials();
  if (!user.emailVerifiedAt) {
    throw new AppError(
      "EMAIL_NOT_VERIFIED",
      403,
      "Verify your email address before signing in.",
    );
  }

  const session = await createSession(user);
  return {
    session,
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      emailVerified: true,
    },
  };
}

export async function logout(
  request: Request,
  user: AuthenticatedUser,
): Promise<void> {
  await revokeCurrentSession(request, user);
}

export async function verifyEmail(
  userId: string,
  accountType: CustomerOrVendor,
  code: string,
): Promise<{
  session: Awaited<ReturnType<typeof createSession>>;
  user: { id: string; accountType: CustomerOrVendor };
}> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      accountType,
      isActive: true,
      emailVerifiedAt: null,
      authAccounts: { some: { provider: "LOCAL" } },
    },
    select: { id: true, accountType: true },
  });
  if (!user) throw invalidCode();

  const session = await prisma.$transaction(async (transaction) => {
    const consumed = await consumeEmailCode(
      user.id,
      "EMAIL_VERIFY",
      code,
      transaction,
    );
    if (!consumed) return null;

    const updated = await transaction.user.updateMany({
      where: { id: user.id, accountType, emailVerifiedAt: null, isActive: true },
      data: { emailVerifiedAt: new Date() },
    });
    if (updated.count !== 1) return null;
    return createSession(user, transaction);
  });
  if (!session) throw invalidCode();
  return {
    session,
    user: { id: user.id, accountType },
  };
}

export async function resendEmailVerification(
  userId: string,
  accountType: CustomerOrVendor,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      accountType,
      isActive: true,
      emailVerifiedAt: null,
      authAccounts: { some: { provider: "LOCAL" } },
    },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new AppError(
      "EMAIL_VERIFICATION_UNAVAILABLE",
      401,
      "This email verification request is no longer available.",
    );
  }
  await issueEmailCode(user.id, user.email, "EMAIL_VERIFY", accountType);
}

export async function requestPasswordReset(
  email: string,
  accountType: CustomerOrVendor,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType,
        normalizedEmail: email.trim().toLowerCase(),
      },
    },
    include: { authAccounts: { where: { provider: "LOCAL" }, select: { id: true } } },
  });
  if (!user || user.authAccounts.length === 0) return;
  await issueEmailCode(user.id, user.email, "PASSWORD_RESET");
}

export async function resetPassword(
  email: string,
  accountType: CustomerOrVendor,
  code: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: {
      accountType_normalizedEmail: {
        accountType,
        normalizedEmail: email.trim().toLowerCase(),
      },
    },
    include: { authAccounts: { where: { provider: "LOCAL" }, select: { id: true } } },
  });
  if (!user || user.authAccounts.length === 0) throw invalidCode();

  const passwordHash = await hashPassword(newPassword);
  const reset = await prisma.$transaction(async (transaction) => {
    const consumed = await consumeEmailCode(
      user.id,
      "PASSWORD_RESET",
      code,
      transaction,
    );
    if (!consumed) return false;

    const accountUpdate = await transaction.userAuthAccount.updateMany({
      where: { userId: user.id, provider: "LOCAL" },
      data: { passwordHash },
    });
    if (accountUpdate.count !== 1) return false;
    await transaction.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  });
  if (!reset) throw invalidCode();
}

export async function authenticatedUserData(user: AuthenticatedUser) {
  const vendorProfile =
    user.accountType === "VENDOR"
      ? await prisma.vendorProfile.findUnique({
          where: { userId: user.id },
          select: { applicationStatus: true, verificationStatus: true },
        })
      : null;

  return {
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      emailVerified: user.emailVerifiedAt !== null,
    },
    ...(user.accountType === "VENDOR"
      ? {
          vendorStatus: vendorProfile?.applicationStatus ?? "NOT_STARTED",
          vendorVerificationStatus:
            vendorProfile?.verificationStatus ?? "UNVERIFIED",
        }
      : {}),
  };
}
