import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  marketplaceOrder: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  vendorOrder: { groupBy: vi.fn(), findMany: vi.fn() },
  ledgerEntry: { aggregate: vi.fn(), findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn() },
  simulatedRefund: { aggregate: vi.fn() },
  vendorPayout: { aggregate: vi.fn() },
  stockReservation: { findFirst: vi.fn() },
  coupon: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  couponRedemption: { count: vi.fn(), create: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/features/commerce/inventory", () => ({
  availableStockInTransaction: vi.fn().mockResolvedValue(10),
  lockInventoryVariants: vi.fn().mockResolvedValue(undefined),
  availableStockForVariants: vi.fn(),
  expireReservations: vi.fn(),
}));

import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import {
  adminMarketplaceAnalytics,
  finalizeCoupon,
  parseMarketplaceAnalyticsDate,
  quoteCheckoutReservation,
  upsertCoupon,
} from "@/features/commerce/marketplace-workflow";

const customer: AuthenticatedUser = {
  id: "customer-1",
  email: "customer@example.test",
  accountType: "CUSTOMER",
  emailVerifiedAt: new Date(),
  hasAmazonIdentity: false,
  sessionId: "session-customer",
};

const admin: AuthenticatedUser = {
  ...customer,
  id: "admin-1",
  accountType: "ADMIN",
  sessionId: "session-admin",
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("stacked checkout coupons", () => {
  it("applies vendor coupons first and limits the platform coupon to remaining merchandise", async () => {
    const reservation = {
      id: "reservation-1",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 60_000),
      items: [{
        variantId: "variant-1",
        quantity: 1,
        unitPrice: new Prisma.Decimal(100),
        variant: {
          stockQuantity: 10,
          product: {
            name: "Product",
            vendor: {
              id: "vendor-1",
              deliveryRule: { fee: new Prisma.Decimal(5) },
              vendorProfile: null,
            },
          },
        },
      }],
    };
    database.stockReservation.findFirst.mockResolvedValue(reservation as never);
    database.$transaction.mockImplementation(((callback: (tx: unknown) => Promise<unknown>) => callback(database)) as never);
    database.$queryRaw.mockResolvedValue([{ id: "coupon-1" }]);
    database.coupon.findFirst.mockImplementation(({ where }: { where: { code: string } }) => Promise.resolve({
      id: where.code === "VENDOR80" ? "vendor-coupon" : "platform-coupon",
      code: where.code,
      scope: where.code === "VENDOR80" ? "VENDOR" : "PLATFORM",
      discountType: "FIXED",
      discountValue: new Prisma.Decimal(where.code === "VENDOR80" ? 80 : 50),
      minOrderAmount: new Prisma.Decimal(0),
      totalUsageLimit: null,
      perCustomerLimit: 1,
    }) as never);
    database.couponRedemption.count.mockResolvedValue(0);

    await expect(quoteCheckoutReservation(customer, {
      reservationId: reservation.id,
      vendorCoupons: { "vendor-1": "VENDOR80" },
      platformCoupon: "PLATFORM50",
    })).resolves.toEqual({ total: "5.00", currency: "USD" });

    const couponChecks = database.coupon.findFirst.mock.calls.map(([args]) => args as { where: { code: string; vendorId?: string | null } });
    expect(couponChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: expect.objectContaining({ code: "VENDOR80", vendorId: "vendor-1" }) }),
      expect.objectContaining({ where: expect.objectContaining({ code: "PLATFORM50", vendorId: null }) }),
    ]));
  });

  it("records platform coupon redemptions as negative platform-funded ledger entries", async () => {
    database.coupon.findFirst.mockResolvedValue({
      id: "platform-coupon",
      code: "PLATFORM20",
      scope: "PLATFORM",
    } as never);
    database.couponRedemption.create.mockResolvedValue({ id: "redemption-1" } as never);
    database.marketplaceOrder.findUniqueOrThrow.mockResolvedValue({
      currency: "USD",
      orderNumber: "SQ-1",
    } as never);
    database.ledgerEntry.create.mockResolvedValue({ id: "ledger-1" } as never);

    await finalizeCoupon(
      database as never,
      customer.id,
      "order-1",
      "PLATFORM20",
      new Prisma.Decimal(20),
    );

    expect(database.couponRedemption.create).toHaveBeenCalledWith({
      data: {
        couponId: "platform-coupon",
        customerId: customer.id,
        orderId: "order-1",
        vendorOrderId: undefined,
        amount: new Prisma.Decimal(20),
      },
    });
    expect(database.ledgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "PLATFORM_DISCOUNT",
        amount: new Prisma.Decimal(-20),
        idempotencyKey: "PLATFORM_DISCOUNT:order-1:platform-coupon",
      }),
    }));
  });

  it("clears a previously configured usage cap when the admin saves no cap", async () => {
    database.coupon.findUnique.mockResolvedValue(null);
    database.coupon.upsert.mockResolvedValue({ code: "NO-CAP" } as never);

    await upsertCoupon(admin, {
      code: "NO-CAP",
      scope: "PLATFORM",
      discountType: "FIXED",
      discountValue: 5,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2027-01-01T00:00:00.000Z",
      totalUsageLimit: null,
    });

    expect(database.coupon.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ totalUsageLimit: null }),
      create: expect.objectContaining({ totalUsageLimit: null }),
    }));
  });
});

describe("marketplace analytics date and metric definitions", () => {
  it("includes the full selected end date and rejects invalid dates", () => {
    expect(parseMarketplaceAnalyticsDate("2026-11-08", true)?.toISOString())
      .toBe("2026-11-08T23:59:59.999Z");
    expect(() => parseMarketplaceAnalyticsDate("not-a-date"))
      .toThrowError(expect.objectContaining({ code: "INVALID_ANALYTICS_DATE" }));
  });

  it("filters all order aggregates by the selected range and reports pre-discount merchandise", async () => {
    const from = new Date("2026-11-01T00:00:00.000Z");
    const to = new Date("2026-11-08T23:59:59.999Z");
    database.marketplaceOrder.findMany.mockResolvedValue([{
      createdAt: new Date("2026-11-08T18:00:00.000Z"),
      subtotalAmount: new Prisma.Decimal(100),
    }] as never);
    database.vendorOrder.groupBy.mockResolvedValue([{ status: "NEW", _count: { _all: 2 } }] as never);
    database.vendorOrder.findMany.mockResolvedValue([{
      vendorId: "vendor-1",
      lines: [{ unitPrice: new Prisma.Decimal(80), quantity: 1 }],
    }] as never);
    database.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(-12) } } as never);
    database.simulatedRefund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(3) } } as never);
    database.vendorPayout.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(4) } } as never);

    const result = await adminMarketplaceAnalytics(from, to);

    expect(result.salesByDay).toEqual([{ day: "2026-11-08", total: "100.00" }]);
    expect(database.marketplaceOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: from, lte: to } }),
      select: { createdAt: true, subtotalAmount: true },
    }));
    expect(database.vendorOrder.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["status"],
      where: { order: { createdAt: { gte: from, lte: to } } },
    }));
    expect(result.topVendors).toEqual([{ vendorId: "vendor-1", total: "80.00" }]);
    expect(database.vendorOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        order: { paymentStatus: "SUCCEEDED", createdAt: { gte: from, lte: to } },
      },
      select: { vendorId: true, lines: { select: { unitPrice: true, quantity: true } } },
    }));
    expect(database.ledgerEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "COMMISSION", createdAt: { gte: from, lte: to } },
    }));
  });
});
