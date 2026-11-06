import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  vendorPayout: { findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
  payoutBatch: { update: vi.fn() },
  auditLog: { create: vi.fn() },
  vendorNotification: { create: vi.fn() },
  vendorOrder: { findUnique: vi.fn() },
  ledgerEntry: { create: vi.fn(), createMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));

import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../src/features/auth/sessions";
import {
  recordPaidVendorOrderLedger,
  retryFailedVendorPayout,
} from "../../src/features/commerce/financial-service";
import { prisma } from "@/lib/prisma";

function paidVendorOrder(overrides: Record<string, unknown> = {}) {
  return {
    vendorId: "vendor-1",
    orderId: "order-1",
    deliveryFee: new Prisma.Decimal(0),
    discountAmount: new Prisma.Decimal(0),
    lines: [{
      unitPrice: new Prisma.Decimal("8.00"),
      quantity: 1,
      commissionPercent: new Prisma.Decimal("10.00"),
      commissionAmount: new Prisma.Decimal("0.80"),
    }],
    order: {
      id: "order-1",
      orderNumber: "SQ-1",
      currency: "USD",
      paymentStatus: "SUCCEEDED",
      status: "PAID",
    },
    couponRedemptions: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("paid vendor order ledger", () => {
  it("posts gross sales and commission atomically using the stored snapshot", async () => {
    const tx = {
      vendorOrder: { findUnique: vi.fn().mockResolvedValue(paidVendorOrder()) },
      ledgerEntry: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };

    await expect(recordPaidVendorOrderLedger(tx as never, "vendor-order-1"))
      .resolves.toEqual({ entriesRecorded: 2, simulated: true });

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: "SALE",
          amount: new Prisma.Decimal("8.00"),
          idempotencyKey: "SALE:vendor-order-1",
        }),
        expect.objectContaining({
          type: "COMMISSION",
          amount: new Prisma.Decimal("-0.80"),
          idempotencyKey: "COMMISSION:vendor-order-1",
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it("posts each vendor's commission separately for a multi-vendor parent order", async () => {
    const orders = new Map([
      ["vendor-order-1", paidVendorOrder()],
      ["vendor-order-2", paidVendorOrder({
        vendorId: "vendor-2",
        lines: [{
          unitPrice: new Prisma.Decimal("12.00"),
          quantity: 1,
          commissionPercent: new Prisma.Decimal("12.00"),
          commissionAmount: new Prisma.Decimal("1.44"),
        }],
      })],
    ]);
    const tx = {
      vendorOrder: { findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(orders.get(where.id))) },
      ledgerEntry: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };

    await recordPaidVendorOrderLedger(tx as never, "vendor-order-1");
    await recordPaidVendorOrderLedger(tx as never, "vendor-order-2");

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledTimes(2);
    expect(tx.ledgerEntry.createMany).toHaveBeenNthCalledWith(2, {
      data: expect.arrayContaining([
        expect.objectContaining({ vendorId: "vendor-2", type: "SALE", amount: new Prisma.Decimal("12.00") }),
        expect.objectContaining({ vendorId: "vendor-2", type: "COMMISSION", amount: new Prisma.Decimal("-1.44") }),
      ]),
      skipDuplicates: true,
    });
  });

  it("keeps repeated successful payment recording idempotent", async () => {
    const tx = {
      vendorOrder: { findUnique: vi.fn().mockResolvedValue(paidVendorOrder()) },
      ledgerEntry: {
        createMany: vi.fn()
          .mockResolvedValueOnce({ count: 2 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };

    await expect(recordPaidVendorOrderLedger(tx as never, "vendor-order-1"))
      .resolves.toMatchObject({ entriesRecorded: 2 });
    await expect(recordPaidVendorOrderLedger(tx as never, "vendor-order-1"))
      .resolves.toMatchObject({ entriesRecorded: 0 });

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledTimes(2);
    expect(tx.ledgerEntry.createMany).toHaveBeenNthCalledWith(2, {
      data: expect.arrayContaining([
        expect.objectContaining({ idempotencyKey: "SALE:vendor-order-1" }),
        expect.objectContaining({ idempotencyKey: "COMMISSION:vendor-order-1" }),
      ]),
      skipDuplicates: true,
    });
  });

  describe("failed simulated payout retry", () => {
    it("reuses the existing payout idempotency key and records a simulated payout once", async () => {
      const admin: AuthenticatedUser = {
        id: "admin-1",
        email: "admin@example.test",
        accountType: "ADMIN",
        emailVerifiedAt: new Date(),
        hasAmazonIdentity: false,
        sessionId: "session-admin",
      };
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: "payout-1" }]),
        vendorPayout: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "payout-1",
            vendorId: "vendor-1",
            batchId: "batch-1",
            reference: "SQ-P-1",
            status: "FAILED",
            amount: new Prisma.Decimal("7.20"),
            currency: "USD",
            allocations: [{
              ledgerEntry: {
                id: "sale-1",
                amount: new Prisma.Decimal("7.20"),
                currency: "USD",
                vendorId: "vendor-1",
                vendorOrder: {
                  status: "DELIVERED",
                  deliveredAt: new Date("2026-10-01T00:00:00.000Z"),
                  order: { status: "PAID", paymentStatus: "SUCCEEDED" },
                  lines: [],
                },
              },
            }],
            entries: [],
          }),
          update: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
        },
        payoutBatch: { update: vi.fn().mockResolvedValue({}) },
        ledgerEntry: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        vendorNotification: { create: vi.fn().mockResolvedValue({}) },
      };
      vi.mocked(prisma.$transaction).mockImplementation(((callback: (client: unknown) => Promise<unknown>) =>
        callback(tx)) as never);

      await expect(retryFailedVendorPayout(admin, "payout-1"))
        .resolves.toMatchObject({ payoutId: "payout-1", status: "SIMULATED_PAID", simulated: true });

      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          type: "PAYOUT",
          amount: new Prisma.Decimal("-7.20"),
          idempotencyKey: "PAYOUT:payout-1",
          simulated: true,
        }),
      }));
      expect(tx.vendorPayout.update).toHaveBeenCalledTimes(2);
      expect(tx.auditLog.create).toHaveBeenCalledOnce();
    });
  });

  it("does not post earnings when a commission snapshot is missing", async () => {
    const tx = {
      vendorOrder: {
        findUnique: vi.fn().mockResolvedValue(paidVendorOrder({
          lines: [{
            unitPrice: new Prisma.Decimal("8.00"),
            quantity: 1,
            commissionPercent: null,
            commissionAmount: null,
          }],
        })),
      },
      ledgerEntry: { createMany: vi.fn() },
    };

    await expect(recordPaidVendorOrderLedger(tx as never, "vendor-order-1"))
      .rejects.toMatchObject({ code: "COMMISSION_SNAPSHOT_MISSING" });
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("rejects orders without a successful captured payment", async () => {
    const tx = {
      vendorOrder: {
        findUnique: vi.fn().mockResolvedValue(paidVendorOrder({
          order: { ...paidVendorOrder().order, paymentStatus: "FAILED" },
        })),
      },
      ledgerEntry: { createMany: vi.fn() },
    };

    await expect(recordPaidVendorOrderLedger(tx as never, "vendor-order-1"))
      .rejects.toMatchObject({ code: "ORDER_NOT_FINANCIALLY_ELIGIBLE" });
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });
});
