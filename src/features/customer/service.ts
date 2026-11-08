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

export async function getPublicUserPhoto(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { profileImageKey: true },
  });
  if (!user?.profileImageKey) throw new AppError("PROFILE_PHOTO_NOT_FOUND", 404, "Profile photo was not found.");
  const mimeType = user.profileImageKey.endsWith(".png")
    ? "image/png"
    : user.profileImageKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return { bytes: await readVendorFile(user.profileImageKey), mimeType };
}

export async function getPublicUserProfile(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      id: true,
      displayName: true,
      accountType: true,
      profileImageKey: true,
      createdAt: true,
      vendorProfile: {
        select: {
          storeName: true,
          businessType: true,
          description: true,
          city: true,
          region: true,
          country: true,
          verificationStatus: true,
          applicationStatus: true,
          files: {
            where: { fileType: "STORE_LOGO" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!user) throw new AppError("USER_NOT_FOUND", 404, "User profile was not found.");

  if (user.accountType === "VENDOR" && user.vendorProfile?.applicationStatus === "APPROVED") {
    const [reviewStats, products] = await Promise.all([
      prisma.productReview.aggregate({
        where: {
          hiddenAt: null,
          product: {
            vendorId: user.id,
            status: "PUBLISHED",
          },
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.product.findMany({
        where: {
          vendorId: user.id,
          status: "PUBLISHED",
        },
        select: {
          id: true,
          name: true,
          nameSo: true,
          variants: {
            where: { isActive: true },
            orderBy: { price: "asc" },
            select: { price: true, stockQuantity: true },
            take: 1,
          },
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            select: { id: true },
            take: 1,
          },
        },
        take: 6,
      }),
    ]);

    return {
      id: user.id,
      displayName: user.vendorProfile.storeName ?? user.displayName ?? "Vendor",
      accountType: "VENDOR" as const,
      hasProfilePhoto: user.profileImageKey !== null,
      joinedAt: user.createdAt.toISOString(),
      vendor: {
        storeName: user.vendorProfile.storeName,
        businessType: user.vendorProfile.businessType,
        description: user.vendorProfile.description,
        isVerified: user.vendorProfile.verificationStatus === "VERIFIED",
        location: [user.vendorProfile.city, user.vendorProfile.region, user.vendorProfile.country].filter(Boolean),
        logoUrl: user.vendorProfile.files[0]?.id ? `/api/v1/vendors/${user.id}/logo` : null,
        ratingAverage: reviewStats._avg.rating ?? 0,
        reviewCount: reviewStats._count._all,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          nameSo: p.nameSo,
          price: p.variants[0]?.price ? Number(p.variants[0].price).toFixed(2) : "0.00",
          stockQuantity: p.variants[0]?.stockQuantity ?? 0,
          imageId: p.images[0]?.id ?? null,
        })),
      },
    };
  }

  const reviews = await prisma.productReview.findMany({
    where: {
      customerId: user.id,
      hiddenAt: null,
    },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          name: true,
          nameSo: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    id: user.id,
    displayName: user.displayName ?? "Customer",
    accountType: "CUSTOMER" as const,
    hasProfilePhoto: user.profileImageKey !== null,
    joinedAt: user.createdAt.toISOString(),
    customer: {
      reviewCount: reviews.length,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        product: r.product,
      })),
    },
  };
}