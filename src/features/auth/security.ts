import { createHmac } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { getAuthConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { getClientIp } from "@/lib/api/requests";

let lastAttemptCleanup = 0;

export function hashSecret(value: string, context: string): string {
  const { secret } = getAuthConfig();
  return createHmac("sha256", secret)
    .update(`${context}\0${value}`)
    .digest("hex");
}

async function consumeLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  await cleanupOldAttempts();
  const keyHash = hashSecret(key, "rate-limit");
  const cutoff = new Date(Date.now() - windowSeconds * 1000);

  const count = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<{ locked: boolean }[]>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${keyHash})) IS NULL AS locked`,
    );

    const previousCount = await transaction.loginAttempt.count({
      where: {
        identifier: keyHash,
        attemptedAt: { gte: cutoff },
      },
    });

    await transaction.loginAttempt.create({
      data: { identifier: keyHash },
    });

    return previousCount + 1;
  });

  if (count > limit) {
    throw new AppError("RATE_LIMITED", 429, "Too many requests. Please try again later.");
  }
}

async function cleanupOldAttempts(): Promise<void> {
  const now = Date.now();
  if (now - lastAttemptCleanup < 60 * 60 * 1000) return;

  await prisma.loginAttempt.deleteMany({
    where: { attemptedAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
  });
  lastAttemptCleanup = now;
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  await consumeLimit(`${scope}:ip:${getClientIp(request)}`, limit * 3, windowSeconds);
  await consumeLimit(`${scope}:identifier:${identifier}`, limit, windowSeconds);
}
