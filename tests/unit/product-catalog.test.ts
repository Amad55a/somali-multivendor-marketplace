import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    productReview: { groupBy: vi.fn() },
    orderLine: { findMany: vi.fn() },
  },
}));
vi.mock("@/features/vendors/service", () => ({ assertApprovedVendor: vi.fn() }));

import { listPublicProducts } from "@/features/products/service";
import { productQuerySchema } from "@/features/products/validation";
import { prisma } from "@/lib/prisma";

afterEach(() => vi.clearAllMocks());

describe("public product catalog", () => {
  it("combines category and text filters and ranks by distinct completed orders", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "product-a",
        reviews: [],
        variants: [],
      },
      {
        id: "product-b",
        reviews: [],
        variants: [],
      },
    ] as never);
    vi.mocked(prisma.productReview.groupBy).mockResolvedValue([
      {
        productId: "product-a",
        _avg: { rating: 4.5 },
        _count: { _all: 2 },
      },
    ] as never);
    vi.mocked(prisma.orderLine.findMany).mockResolvedValue([
      { variant: { productId: "product-a" }, vendorOrder: { orderId: "order-a" } },
      { variant: { productId: "product-a" }, vendorOrder: { orderId: "order-a" } },
      { variant: { productId: "product-b" }, vendorOrder: { orderId: "order-b" } },
      { variant: { productId: "product-b" }, vendorOrder: { orderId: "order-c" } },
    ] as never);

    const products = await listPublicProducts(productQuerySchema.parse({
      category: "accessories",
      search: "woven bag",
      sort: "best_selling",
    }));

    const where = vi.mocked(prisma.product.findMany).mock.calls[0]?.[0]?.where;
    if (!where) throw new Error("The catalog query should include filters.");
    const filters = Array.isArray(where.AND) ? where.AND : [where.AND];
    expect(filters).toHaveLength(2);
    expect(filters[0]).toHaveProperty("OR");
    expect(filters[1]).toHaveProperty("OR");
    expect(products.map(({ id }) => id)).toEqual(["product-b", "product-a"]);
    expect(products[1]).toMatchObject({
      ratingAverage: 4.5,
      reviewCount: 2,
      purchaseCount: 1,
    });
    expect(products[0]).toMatchObject({
      ratingAverage: 0,
      reviewCount: 0,
      purchaseCount: 2,
    });
  });
});
