import "server-only";

import { prisma } from "@/lib/prisma";

export async function getVendorDashboardData(userId: string) {
  const [profile, products, variants, categories, totalProducts, productStatusCounts, orderStatusCounts, paidOrders] = await Promise.all([
    prisma.vendorProfile.findUnique({
      where: { userId },
      select: {
        storeName: true,
        businessName: true,
        description: true,
        phone: true,
        country: true,
        region: true,
        city: true,
        district: true,
        address: true,
        businessType: true,
        marketAssociation: true,
        mobileMoneyNumber: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        informationRequest: true,
        files: { select: { id: true, fileType: true, mimeType: true } },
        applicationStatus: true,
        verificationStatus: true,
        user: { select: { displayName: true } },
        changeRequests: {
          where: { status: { in: ["DRAFT", "PENDING"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            proposed: true,
            vendorNote: true,
            submittedAt: true,
            files: {
              select: { id: true, fileType: true, mimeType: true, originalName: true },
            },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { vendorId: userId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        variants: {
          select: { sku: true, price: true, stockQuantity: true, isActive: true },
          orderBy: { createdAt: "asc" },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { id: true },
        },
      },
    }),
    prisma.productVariant.findMany({
      where: { product: { vendorId: userId } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        sku: true,
        variantName: true,
        stockQuantity: true,
        updatedAt: true,
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameSo: true, slug: true, description: true, descriptionSo: true, parentId: true },
    }),
    prisma.product.count({ where: { vendorId: userId } }),
    prisma.product.groupBy({
      by: ["status"],
      where: { vendorId: userId },
      _count: { _all: true },
    }),
    prisma.vendorOrder.groupBy({
      by: ["status"],
      where: { vendorId: userId },
      _count: { _all: true },
    }),
    prisma.vendorOrder.aggregate({
      where: { vendorId: userId, status: { notIn: ["CANCELLED", "EXPIRED"] }, order: { paymentStatus: "SUCCEEDED" } },
      _sum: { subtotalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const counts = {
    total: totalProducts,
    draft: productStatusCounts.find((item) => item.status === "DRAFT")?._count._all ?? 0,
    published: productStatusCounts.find((item) => item.status === "PUBLISHED")?._count._all ?? 0,
    archived: productStatusCounts.find((item) => item.status === "ARCHIVED")?._count._all ?? 0,
  };

  return {
    profile,
    products,
    variants,
    categories,
    counts,
    lowStock: variants.filter((variant) => variant.stockQuantity > 0 && variant.stockQuantity <= 5),
    outOfStock: variants.filter((variant) => variant.stockQuantity === 0),
    orderCounts: {
      total: orderStatusCounts.reduce((sum, item) => sum + item._count._all, 0),
      pending: orderStatusCounts.find((item) => item.status === "NEW")?._count._all ?? 0,
      completed: orderStatusCounts.find((item) => item.status === "DELIVERED")?._count._all ?? 0,
    },
    salesTotal: paidOrders._sum.subtotalAmount?.toFixed(2) ?? "0.00",
    paidOrderCount: paidOrders._count._all,
  };
}

export async function getVendorShellContext(userId: string) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: {
      storeName: true,
      businessName: true,
      files: {
        where: { fileType: "STORE_LOGO" },
        select: { id: true },
        take: 1,
      },
    },
  });
  return {
    storeName: profile?.storeName ?? profile?.businessName ?? null,
    logoFileId: profile?.files[0]?.id ?? null,
  };
}
