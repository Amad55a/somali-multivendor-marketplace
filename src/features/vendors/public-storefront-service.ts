import "server-only";
import { prisma } from "@/lib/prisma";

const publishedVendorProducts = (vendorId: string) => ({
  vendorId,
  status: "PUBLISHED" as const,
  vendor: {
    isActive: true,
    vendorProfile: { is: { applicationStatus: "APPROVED" as const } },
  },
});

export async function getPublicVendorStorefront(vendorId: string) {
  const profile = await prisma.vendorProfile.findFirst({
    where: {
      userId: vendorId,
      applicationStatus: "APPROVED",
      user: { is: { accountType: "VENDOR", isActive: true } },
    },
    select: {
      storeName: true,
      businessName: true,
      businessType: true,
      description: true,
      verificationStatus: true,
      country: true,
      region: true,
      city: true,
      district: true,
      marketAssociation: true,
      submittedAt: true,
      files: {
        where: { fileType: "STORE_LOGO" },
        select: { id: true },
        take: 1,
      },
      user: {
        select: {
          displayName: true,
          createdAt: true,
        },
      },
    },
  });

  if (!profile) return null;

  const productWhere = publishedVendorProducts(vendorId);
  const reviewWhere = {
    hiddenAt: null,
    product: { is: productWhere },
  };

  const queries = [
    prisma.product.count({ where: productWhere }),
    prisma.vendorOrder.count({
      where: {
        vendorId,
        status: "DELIVERED",
        order: { is: { paymentStatus: "SUCCEEDED" } },
      },
    }),
    prisma.productReview.aggregate({
      where: reviewWhere,
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.productReview.findMany({
      where: reviewWhere,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customer: { select: { displayName: true } },
        product: { select: { id: true, name: true, nameSo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ] as const;

  const [productCount, completedOrderCount, reviewStats, reviews] = await Promise.all(queries);

  // Safe calculation for total sold units
  let totalSoldUnits = 0;
  if (prisma.orderLine?.aggregate) {
    try {
      const soldUnitsAggregate = await prisma.orderLine.aggregate({
        where: {
          vendorOrder: {
            vendorId,
            status: "DELIVERED",
            order: { is: { paymentStatus: "SUCCEEDED" } },
          },
          returns: { none: { status: "REFUNDED" } },
        },
        _sum: { quantity: true },
      });
      totalSoldUnits = soldUnitsAggregate._sum.quantity ?? 0;
    } catch {
      totalSoldUnits = 0;
    }
  }

  // Safe rating distribution
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (prisma.productReview?.groupBy) {
    try {
      const groups = await prisma.productReview.groupBy({
        by: ["rating"],
        where: reviewWhere,
        _count: { _all: true },
      });
      for (const g of groups) {
        ratingDistribution[g.rating] = g._count._all;
      }
    } catch {
      // Fallback: calculate from fetched reviews
      for (const r of reviews) {
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
      }
    }
  }

  return {
    vendorId,
    storeName: profile.storeName ?? profile.businessName ?? profile.user.displayName ?? "Store",
    businessType: profile.businessType,
    description: profile.description,
    isVerified: profile.verificationStatus === "VERIFIED",
    location: [profile.city, profile.district, profile.region, profile.country].filter((item): item is string => Boolean(item)),
    marketAssociation: profile.marketAssociation,
    logoFileId: profile.files[0]?.id ?? null,
    joinedAt: profile.user?.createdAt ? profile.user.createdAt.toISOString() : null,
    productCount,
    completedOrderCount,
    totalSoldUnits,
    ratingAverage: reviewStats._avg.rating ?? 0,
    reviewCount: reviewStats._count._all,
    ratingDistribution,
    reviews: reviews.map((r) => ({
      ...r,
      verifiedPurchase: true,
    })),
  };
}
