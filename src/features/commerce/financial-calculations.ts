import { Prisma } from "../../../generated/prisma/client";

export type CommissionCategory = {
  id: string;
  parentId: string | null;
  commission: { percent: Prisma.Decimal; isActive: boolean } | null;
};

export function resolveCommissionPercent(
  categoryId: string | null,
  categories: CommissionCategory[],
  defaultPercent: Prisma.Decimal,
) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let currentId = categoryId;

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error("Category hierarchy contains a cycle.");
    }
    visited.add(currentId);
    const category = categoriesById.get(currentId);
    if (!category) break;
    if (category.commission?.isActive) return category.commission.percent;
    currentId = category.parentId;
  }

  return defaultPercent;
}

export function sumLedgerAmounts(entries: Array<{ amount: Prisma.Decimal }>) {
  return entries.reduce(
    (total, entry) => total.add(entry.amount),
    new Prisma.Decimal(0),
  );
}

export function summarizeLedgerEntriesByVendorCurrency(
  entries: Array<{
    id: string;
    vendorId: string | null;
    vendorOrderId: string | null;
    currency: string;
    amount: Prisma.Decimal;
  }>,
) {
  const groups = new Map<string, {
    vendorId: string;
    currency: string;
    amount: Prisma.Decimal;
    entryIds: string[];
    orderIds: Set<string>;
  }>();

  for (const entry of entries) {
    if (!entry.vendorId) continue;
    const key = `${entry.vendorId}:${entry.currency}`;
    const group = groups.get(key) ?? {
      vendorId: entry.vendorId,
      currency: entry.currency,
      amount: new Prisma.Decimal(0),
      entryIds: [],
      orderIds: new Set<string>(),
    };
    group.amount = group.amount.add(entry.amount);
    group.entryIds.push(entry.id);
    if (entry.vendorOrderId) group.orderIds.add(entry.vendorOrderId);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    orderIds: [...group.orderIds],
  }));
}

export function commissionForLine(
  unitPrice: Prisma.Decimal,
  quantity: number,
  percent: Prisma.Decimal,
) {
  return new Prisma.Decimal(
    unitPrice.mul(quantity).mul(percent).div(100).toFixed(2),
  );
}

export const PAYOUT_HOLD_MS = 7 * 24 * 60 * 60 * 1000;
export const SOURCE_LEDGER_TYPES = ["SALE", "COMMISSION", "VENDOR_DISCOUNT", "DELIVERY_FEE"] as const;
export const ADJUSTMENT_LEDGER_TYPES = ["REFUND", "REFUND_ADJUSTMENT", "ADJUSTMENT"] as const;

export function lineGross(unitPrice: Prisma.Decimal, quantity: number) {
  return new Prisma.Decimal(unitPrice).mul(quantity);
}

export function vendorEarningsBeforeOtherDeductions(
  productSales: Prisma.Decimal,
  commission: Prisma.Decimal,
) {
  return productSales.sub(commission);
}

export function payoutHoldCutoff(now: Date, holdMs = PAYOUT_HOLD_MS) {
  return new Date(now.getTime() - holdMs);
}

export function isDevelopmentPayoutHoldOverrideAllowed() {
  return process.env.NODE_ENV !== "production";
}

export function resolvePayoutHoldMs(holdDays?: number) {
  if (holdDays === undefined) return PAYOUT_HOLD_MS;
  if (!isDevelopmentPayoutHoldOverrideAllowed()) {
    throw new Error("PAYOUT_HOLD_OVERRIDE_FORBIDDEN");
  }
  if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > 7) {
    throw new Error("INVALID_PAYOUT_HOLD_DAYS");
  }
  return holdDays * 24 * 60 * 60 * 1000;
}

export function vendorOrderPayoutEligible(input: {
  paymentStatus: string;
  orderStatus: string;
  vendorStatus: string;
  deliveredAt: Date | null;
  cutoff: Date;
  hasBlockingReturn: boolean;
}) {
  return input.paymentStatus === "SUCCEEDED"
    && input.orderStatus === "PAID"
    && input.vendorStatus === "DELIVERED"
    && input.deliveredAt !== null
    && input.deliveredAt.getTime() < input.cutoff.getTime()
    && !input.hasBlockingReturn;
}

export function capturedLedgerKey(type: string, vendorOrderId: string, orderLineId?: string) {
  return orderLineId ? `${type}:${vendorOrderId}:${orderLineId}` : `${type}:${vendorOrderId}`;
}

export type ReconcileLedgerEntry = {
  type: string;
  amount: Prisma.Decimal;
  idempotencyKey: string;
};
export type ReconcileVendorOrder = {
  id: string;
  status: string;
  discountAmount: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  paymentStatus: string;
  orderStatus: string;
  orderNumber: string;
  lines: Array<{
    unitPrice: Prisma.Decimal;
    quantity: number;
    commissionAmount: Prisma.Decimal | null;
    commissionPercent: Prisma.Decimal | null;
  }>;
  ledgerEntries: ReconcileLedgerEntry[];
};

export function reconcilePaidVendorOrder(order: ReconcileVendorOrder) {
  const expectedSales = order.lines.reduce(
    (sum, line) => sum.add(lineGross(line.unitPrice, line.quantity)),
    new Prisma.Decimal(0),
  );
  const missingSnapshot = order.lines.some((line) => line.commissionAmount === null || line.commissionPercent === null);
  const expectedCommission = order.lines.reduce(
    (sum, line) => sum.add(
      line.commissionPercent === null
        ? 0
        : commissionForLine(line.unitPrice, line.quantity, line.commissionPercent),
    ).neg(),
    new Prisma.Decimal(0),
  );
  const incorrectSnapshot = order.lines.some((line) =>
    line.commissionPercent !== null &&
    line.commissionAmount !== null &&
    !line.commissionAmount.eq(
      commissionForLine(line.unitPrice, line.quantity, line.commissionPercent),
    ),
  );
  const expectedDiscount = new Prisma.Decimal(order.discountAmount).neg();
  const expectedDelivery = new Prisma.Decimal(order.deliveryFee);
  const baseEntries = (type: string) => order.ledgerEntries.filter((entry) =>
    entry.type === type && entry.idempotencyKey === `${type}:${order.id}`,
  );
  const actualByType = (type: string) => sumLedgerAmounts(baseEntries(type));
  const actualSales = actualByType("SALE");
  const actualCommission = actualByType("COMMISSION");
  const actualDiscount = actualByType("VENDOR_DISCOUNT");
  const actualDelivery = actualByType("DELIVERY_FEE");
  const saleCount = order.ledgerEntries.filter((entry) => entry.type === "SALE").length;
  const commissionCount = baseEntries("COMMISSION").length;
  const issues: string[] = [];

  if (missingSnapshot) issues.push("Missing commission snapshot");
  if (incorrectSnapshot) issues.push("Incorrect commission snapshot amount");
  if (actualSales.isZero() && expectedSales.gt(0)) issues.push("Missing vendor earnings entry");
  if (commissionCount === 0 && expectedCommission.lt(0)) issues.push("Missing commission entry");
  if (!actualCommission.isZero() && !actualCommission.eq(expectedCommission) && !missingSnapshot) {
    issues.push("Incorrect commission amount");
  }
  if (saleCount > 1 || commissionCount > 1) {
    issues.push("Duplicate commission entry");
  }

  const differences = {
    sales: expectedSales.sub(actualSales),
    commission: expectedCommission.sub(actualCommission),
    vendorDiscount: expectedDiscount.sub(actualDiscount),
    deliveryFee: expectedDelivery.sub(actualDelivery),
  };
  if (issues.length === 0 && Object.values(differences).some((amount) => !amount.isZero())) {
    issues.push("Order totals and ledger entries do not match");
  }

  return {
    issues: [...new Set(issues)],
    differences,
    expectedSales,
    expectedCommission,
    expectedDiscount,
    expectedDelivery,
    actualSales,
    actualCommission,
    actualDiscount,
    actualDelivery,
  };
}
