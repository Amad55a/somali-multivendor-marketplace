import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendorProfile: { findFirst: vi.fn() },
    product: { count: vi.fn() },
    vendorOrder: { count: vi.fn() },
    productReview: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));

import { getPublicVendorStorefront } from "@/features/vendors/public-storefront-service";
import { prisma } from "@/lib/prisma";

afterEach(() => vi.clearAllMocks());

describe("public vendor storefront", () => {
  it("only exposes an active approved vendor and aggregates visible reviews for published products", async () => {
    vi.mocked(prisma.vendorProfile.findFirst).mockResolvedValue({
      storeName: "Bilan Crafts",
      businessName: "Bilan Trading",
      businessType: "Handicrafts",
      description: "Locally made goods",
      verificationStatus: "UNVERIFIED",
      country: "Somalia",
      region: "Banadir",
      city: "Mogadishu",
      district: null,
      marketAssociation: null,
      files: [{ id: "logo-id" }],
      user: { displayName: "Bilan" },
    } as never);
    vi.mocked(prisma.product.count).mockResolvedValue(4);
    vi.mocked(prisma.vendorOrder.count).mockResolvedValue(12);
    vi.mocked(prisma.productReview.aggregate).mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 2 },
    } as never);
    vi.mocked(prisma.productReview.findMany).mockResolvedValue([
      {
        id: "review-id",
        rating: 5,
        comment: "Excellent",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        customer: { displayName: "Customer" },
        product: { id: "product-id", name: "Basket", nameSo: "Dambiil" },
      },
    ] as never);

    const storefront = await getPublicVendorStorefront("vendor-id");

    expect(prisma.vendorProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "vendor-id",
        applicationStatus: "APPROVED",
        user: { is: { accountType: "VENDOR", isActive: true } },
      },
    }));
    expect(prisma.product.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vendorId: "vendor-id", status: "PUBLISHED" }),
    }));
    expect(prisma.productReview.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        hiddenAt: null,
        product: { is: expect.objectContaining({ vendorId: "vendor-id", status: "PUBLISHED" }) },
      }),
    }));
    expect(storefront).toMatchObject({
      storeName: "Bilan Crafts",
      isVerified: false,
      location: ["Mogadishu", "Banadir", "Somalia"],
      logoFileId: "logo-id",
      productCount: 4,
      completedOrderCount: 12,
      ratingAverage: 4.5,
      reviewCount: 2,
      reviews: [{ id: "review-id", product: { id: "product-id" } }],
    });
  });

  it("hides non-approved or inactive vendor profiles", async () => {
    vi.mocked(prisma.vendorProfile.findFirst).mockResolvedValue(null);

    await expect(getPublicVendorStorefront("inactive-vendor")).resolves.toBeNull();
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(prisma.vendorOrder.count).not.toHaveBeenCalled();
    expect(prisma.productReview.findMany).not.toHaveBeenCalled();
  });
});
