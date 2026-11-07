import "server-only";

import type { AuthenticatedUser } from "@/features/auth/sessions";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { readVendorFile, removeVendorFile, saveProductImage } from "@/lib/media/vendor-files";

export async function getCustomerProfile(user: AuthenticatedUser) {
  const profile = await prisma.user.findFirst({
    where: { id: user.id, accountType: "CUSTOMER" },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      profileImageKey: true,
      createdAt: true,
    },
  });
  if (!profile) throw new AppError("PROFILE_NOT_FOUND", 404, "Customer profile was not found.");
  return {
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      emailVerified: profile.emailVerifiedAt !== null,
      createdAt: profile.createdAt,
      hasProfilePhoto: profile.profileImageKey !== null,
    },
  };
}

export async function updateCustomerProfile(user: AuthenticatedUser, displayName: string) {
  const profile = await prisma.user.updateMany({
    where: { id: user.id, accountType: "CUSTOMER", isActive: true },
    data: { displayName: displayName.trim() },
  });
  if (profile.count !== 1) throw new AppError("PROFILE_NOT_FOUND", 404, "Customer profile was not found.");
  return getCustomerProfile(user);
}

export async function updateCustomerProfilePhoto(user: AuthenticatedUser, file: File) {
  const existing = await prisma.user.findFirst({
    where: { id: user.id, accountType: "CUSTOMER", isActive: true },
    select: { profileImageKey: true },
  });
  if (!existing) throw new AppError("PROFILE_NOT_FOUND", 404, "Customer profile was not found.");
  const stored = await saveProductImage(file);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { profileImageKey: stored.storageKey },
    });
  } catch (error) {
    await removeVendorFile(stored.storageKey);
    throw error;
  }
  if (existing.profileImageKey) await removeVendorFile(existing.profileImageKey);
  return { updated: true as const };
}

export async function removeCustomerProfilePhoto(user: AuthenticatedUser) {
  const profile = await prisma.user.findFirst({
    where: { id: user.id, accountType: "CUSTOMER", isActive: true },
    select: { profileImageKey: true },
  });
  if (!profile) throw new AppError("PROFILE_NOT_FOUND", 404, "Customer profile was not found.");
  if (profile.profileImageKey) {
    await prisma.user.update({
      where: { id: user.id },
      data: { profileImageKey: null },
    });
    await removeVendorFile(profile.profileImageKey);
  }
  return { updated: true as const };
}

export async function getCustomerProfilePhoto(user: AuthenticatedUser) {
  const profile = await prisma.user.findFirst({
    where: { id: user.id, accountType: "CUSTOMER", isActive: true },
    select: { profileImageKey: true },
  });
  if (!profile?.profileImageKey) throw new AppError("PROFILE_PHOTO_NOT_FOUND", 404, "Profile photo was not found.");
  const mimeType = profile.profileImageKey.endsWith(".png")
    ? "image/png"
    : profile.profileImageKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return { bytes: await readVendorFile(profile.profileImageKey), mimeType };
}
