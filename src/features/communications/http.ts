import "server-only";

import { z } from "zod";
import { enforceRateLimit } from "@/features/auth/security";
import { requireUser, type AuthenticatedUser } from "@/features/auth/sessions";
import { assertSameOrigin, createValidationError } from "@/lib/api/requests";
import { AppError } from "@/lib/errors/app-error";

export async function requireCommunicationUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const user = await requireUser(request, ["CUSTOMER", "VENDOR"]);
  if (!user.emailVerifiedAt && !user.hasAmazonIdentity) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email address to use messaging.");
  }
  return user;
}

export async function requireCommunicationAdmin(
  request: Request,
): Promise<AuthenticatedUser> {
  return requireUser(request, ["ADMIN"]);
}

export async function prepareCommunicationWrite(
  request: Request,
  user: AuthenticatedUser,
  scope: string,
  maximum: number,
  windowSeconds: number,
) {
  assertSameOrigin(request);
  await enforceRateLimit(request, scope, user.id, maximum, windowSeconds);
}

export function parseCommunicationId(value: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw createValidationError(result.error);
  return result.data;
}
