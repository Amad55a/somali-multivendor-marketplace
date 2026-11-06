import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import {
  commissionForLine,
  reconcilePaidVendorOrder,
  resolveCommissionPercent,
  summarizeLedgerEntriesByVendorCurrency,
  vendorEarningsBeforeOtherDeductions,
  vendorOrderPayoutEligible,
} from "../../src/features/commerce/financial-calculations";

describe("financial calculations", () => {
  it("uses the nearest active ancestor commission and falls back to default", () => {
    const categories = [
      { id: "parent", parentId: null, commission: { percent: new Prisma.Decimal(12), isActive: true } },
      { id: "child", parentId: "parent", commission: { percent: new Prisma.Decimal(8), isActive: false } },
      { id: "override", parentId: "child", commission: { percent: new Prisma.Decimal(5), isActive: true } },
    ];

    expect(resolveCommissionPercent("child", categories, new Prisma.Decimal(10)).toString()).toBe("12");
    expect(resolveCommissionPercent("override", categories, new Prisma.Decimal(10)).toString()).toBe("5");
    expect(resolveCommissionPercent(null, categories, new Prisma.Decimal(10)).toString()).toBe("10");
  });

  it("calculates line commissions with decimal rounding", () => {
    expect(commissionForLine(
      new Prisma.Decimal("19.99"),
      3,
      new Prisma.Decimal("10"),
    ).toFixed(2)).toBe("6.00");
  });

  it("deducts a 10% commission from an $8 vendor sale without changing customer price", () => {
    const sale = new Prisma.Decimal("8.00");
    const commission = commissionForLine(sale, 1, new Prisma.Decimal("10"));

    expect(commission.toFixed(2)).toBe("0.80");
    expect(vendorEarningsBeforeOtherDeductions(sale, commission).toFixed(2)).toBe("7.20");
  });

  it.each([
    { category: "default", rate: "10", commission: "2.00", earnings: "18.00" },
    { category: "electronics", rate: "8", commission: "1.60", earnings: "18.40" },
    { category: "clothing", rate: "12", commission: "2.40", earnings: "17.60" },
  ])("calculates a $20 $category sale at $rate% commission", ({ rate, commission: expectedCommission, earnings }) => {
    const sale = new Prisma.Decimal("20.00");
    const commission = commissionForLine(sale, 1, new Prisma.Decimal(rate));

    expect(commission.toFixed(2)).toBe(expectedCommission);
    expect(vendorEarningsBeforeOtherDeductions(sale, commission).toFixed(2)).toBe(earnings);
  });

  it("compares commission ledger amounts against the order's rate snapshot", () => {
    const result = reconcilePaidVendorOrder({
      id: "vendor-order-1",
      status: "NEW",
      discountAmount: new Prisma.Decimal(0),
      deliveryFee: new Prisma.Decimal(0),
      paymentStatus: "SUCCEEDED",
      orderStatus: "PAID",
      orderNumber: "SQ-1",
      lines: [{
        unitPrice: new Prisma.Decimal("8.00"),
        quantity: 1,
        commissionPercent: new Prisma.Decimal("10.00"),
        commissionAmount: new Prisma.Decimal("0.80"),
      }],
      ledgerEntries: [
        { type: "SALE", amount: new Prisma.Decimal("8.00"), idempotencyKey: "SALE:vendor-order-1" },
        { type: "COMMISSION", amount: new Prisma.Decimal("-0.80"), idempotencyKey: "COMMISSION:vendor-order-1" },
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.expectedCommission.toFixed(2)).toBe("-0.80");
    expect(result.actualCommission.toFixed(2)).toBe("-0.80");
  });

  it("requires successful payment, delivery, no blocking return, and an expired hold for payout eligibility", () => {
    const cutoff = new Date("2026-11-06T00:00:00.000Z");
    const base = {
      paymentStatus: "SUCCEEDED",
      orderStatus: "PAID",
      vendorStatus: "DELIVERED",
      deliveredAt: new Date("2026-10-29T23:59:59.999Z"),
      cutoff,
      hasBlockingReturn: false,
    };

    expect(vendorOrderPayoutEligible(base)).toBe(true);
    expect(vendorOrderPayoutEligible({ ...base, deliveredAt: cutoff })).toBe(false);
    expect(vendorOrderPayoutEligible({ ...base, deliveredAt: null })).toBe(false);
    expect(vendorOrderPayoutEligible({ ...base, hasBlockingReturn: true })).toBe(false);
    expect(vendorOrderPayoutEligible({ ...base, paymentStatus: "PENDING" })).toBe(false);
  });

  it("keeps vendor balances separate by currency", () => {
    const groups = summarizeLedgerEntriesByVendorCurrency([
      { id: "usd-sale", vendorId: "vendor-1", vendorOrderId: "order-1", currency: "USD", amount: new Prisma.Decimal("20") },
      { id: "usd-fee", vendorId: "vendor-1", vendorOrderId: "order-1", currency: "USD", amount: new Prisma.Decimal("-2") },
      { id: "eur-sale", vendorId: "vendor-1", vendorOrderId: "order-2", currency: "EUR", amount: new Prisma.Decimal("15") },
      { id: "platform-discount", vendorId: null, vendorOrderId: null, currency: "USD", amount: new Prisma.Decimal("-3") },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ vendorId: "vendor-1", currency: "USD", amount: new Prisma.Decimal("18"), entryIds: ["usd-sale", "usd-fee"], orderIds: ["order-1"] }),
      expect.objectContaining({ vendorId: "vendor-1", currency: "EUR", amount: new Prisma.Decimal("15"), entryIds: ["eur-sale"], orderIds: ["order-2"] }),
    ]));
  });
});
