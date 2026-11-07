import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { simulatedPayoutAdapter, type PayoutAdapter } from "@/features/commerce/payout-adapter";
import {
  ADJUSTMENT_LEDGER_TYPES,
  PAYOUT_HOLD_MS,
  SOURCE_LEDGER_TYPES,
  lineGross,
  payoutHoldCutoff,
  reconcilePaidVendorOrder,
  resolveCommissionPercent,
  resolvePayoutHoldMs,
  sumLedgerAmounts,
  summarizeLedgerEntriesByVendorCurrency,
  summarizeVendorLedger,
  vendorOrderPayoutPendingReason,
  vendorOrderPayoutEligible,
  type CommissionCategory,
} from "@/features/commerce/financial-calculations";
import type { AuthenticatedUser } from "@/features/auth/sessions";

const sourceTypes = SOURCE_LEDGER_TYPES;
const balanceAdjustmentTypes = ADJUSTMENT_LEDGER_TYPES;
const unresolvedReturnStatuses = [
  "REQUESTED",
  "VENDOR_APPROVED",
  "RETURN_SHIPPED",
  "ESCALATED",
  "ADMIN_APPROVED",
  "RETURNED",
  "RECEIVED",
  "REFUND_PROCESSING",
] as const;

function money(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

function payoutHoldDuration(holdDays?: number) {
  try {
    return resolvePayoutHoldMs(holdDays);
  } catch (error) {
    if (error instanceof Error && error.message === "PAYOUT_HOLD_OVERRIDE_FORBIDDEN") {
      throw new AppError("PAYOUT_HOLD_OVERRIDE_FORBIDDEN", 403, "The payout hold override is available only in development.");
    }
    if (error instanceof Error && error.message === "INVALID_PAYOUT_HOLD_DAYS") {
      throw new AppError("INVALID_PAYOUT_HOLD_DAYS", 400, "The development payout hold must be between 0 and 7 whole days.");
    }
    throw error;
  }
}

function totalsByCurrency(entries: Array<{ currency: string; amount: Prisma.Decimal }>) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    totals.set(entry.currency, (totals.get(entry.currency) ?? new Prisma.Decimal(0)).add(entry.amount));
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: money(amount) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function weekStartUtc(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date;
}

function payoutWeekKey(start: Date) {
  return start.toISOString().slice(0, 10);
}

function effectiveCommissionSource(categoryId: string, categories: CommissionCategory[]) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let currentId: string | null = categoryId;
  while (currentId) {
    if (visited.has(currentId)) throw new Error("Category hierarchy contains a cycle.");
    visited.add(currentId);
    const category = categoriesById.get(currentId);
    if (!category) return null;
    if (category.commission?.isActive) return category.id;
    currentId = category.parentId;
  }
  return null;
}

export async function getAdminCommissionSettings() {
  const [settings, categories, history] = await Promise.all([
    prisma.commissionSettings.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.category.findMany({
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: { commission: true },
    }),
    prisma.categoryCommissionHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { changedBy: { select: { email: true } } },
    }),
  ]);
  const commissionCategories: CommissionCategory[] = categories.map((category) => ({
    id: category.id,
    parentId: category.parentId,
    commission: category.commission
      ? { percent: category.commission.percent, isActive: category.commission.isActive }
      : null,
  }));
  return {
    defaultPercent: settings.defaultPercent.toString(),
    categories: categories.map((category) => {
      const sourceId = effectiveCommissionSource(category.id, commissionCategories);
      return {
        id: category.id,
        name: category.name,
        nameSo: category.nameSo,
        parentId: category.parentId,
        isActive: category.isActive,
        configuredPercent: category.commission?.percent.toString() ?? null,
        ruleActive: category.commission?.isActive ?? false,
        effectivePercent: resolveCommissionPercent(category.id, commissionCategories, settings.defaultPercent).toString(),
        inheritedFrom: sourceId
          ? categories.find((candidate) => candidate.id === sourceId)?.name ?? "Category rule"
          : "Default",
      };
    }),
    history: history.map((entry) => ({
      id: entry.id,
      categoryName: entry.categoryName,
      previousPercent: entry.previousPercent?.toString() ?? null,
      percent: entry.percent.toString(),
      isActive: entry.isActive,
      changedBy: entry.changedBy.email,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

function assertCommissionPercent(percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new AppError("INVALID_COMMISSION", 400, "Commission must be between 0 and 100.");
  }
}

async function notifyVendorsForCommissionChanges(
  tx: Prisma.TransactionClient,
  categoryIds: string[],
  scopeName: string,
) {
  if (categoryIds.length === 0) return;
  const products = await tx.product.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { vendorId: true },
    distinct: ["vendorId"],
  });
  if (products.length === 0) return;
  await tx.vendorNotification.createMany({
    data: products.map(({ vendorId }) => ({
      vendorId,
      title: "Commission rates affecting future orders changed",
      titleSo: "Heerarka komishanka ee dalabyada mustaqbalka waa la beddelay",
      body: `An administrator changed the commission rules for ${scopeName}. The new rates apply only to future orders.`,
      bodySo: `Maamule ayaa beddelay xeerarka komishanka ee ${scopeName}. Heerarka cusub waxay khuseeyaan dalabyada mustaqbalka oo keliya.`,
      entityType: "CategoryCommission",
      entityId: categoryIds[0]!,
      href: "/vendor/payouts",
    })),
  });
}

export async function updateCategoryCommission(
  admin: AuthenticatedUser,
  categoryId: string,
  percent: number,
  isActive: boolean,
) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin access is required.");
  assertCommissionPercent(percent);
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
    if (!category) throw new AppError("CATEGORY_NOT_FOUND", 404, "The category does not exist.");
    const [existingRules, settings, categories] = await Promise.all([
      tx.categoryCommission.findMany(),
      tx.commissionSettings.findUniqueOrThrow({ where: { id: "default" } }),
      tx.category.findMany({ select: { id: true, parentId: true } }),
    ]);
    const priorRule = existingRules.find((rule) => rule.categoryId === categoryId);
    const beforeCategories: CommissionCategory[] = categories.map((item) => {
      const rule = existingRules.find((candidate) => candidate.categoryId === item.id);
      return { id: item.id, parentId: item.parentId, commission: rule ? { percent: rule.percent, isActive: rule.isActive } : null };
    });
    const updated = await tx.categoryCommission.upsert({
      where: { categoryId },
      update: { percent, isActive, updatedById: admin.id },
      create: { categoryId, percent, isActive, updatedById: admin.id },
    });
    const afterCategories: CommissionCategory[] = beforeCategories.map((item) =>
      item.id === categoryId ? { ...item, commission: { percent: updated.percent, isActive: updated.isActive } } : item,
    );
    const affectedCategoryIds = categories
      .filter((item) => !resolveCommissionPercent(item.id, beforeCategories, settings.defaultPercent)
        .eq(resolveCommissionPercent(item.id, afterCategories, settings.defaultPercent)))
      .map((item) => item.id);
    await tx.categoryCommissionHistory.create({
      data: {
        categoryId,
        categoryName: category.name,
        previousPercent: priorRule?.percent ?? null,
        percent: updated.percent,
        isActive,
        changedById: admin.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "CATEGORY_COMMISSION_UPDATED",
        entityType: "CategoryCommission",
        entityId: categoryId,
        metadata: {
          categoryName: category.name,
          previousPercent: priorRule?.percent.toString() ?? null,
          percent: updated.percent.toString(),
          isActive,
          inheritance: "A subcategory inherits the nearest active ancestor rule; otherwise it uses the default rate.",
        },
      },
    });
    await notifyVendorsForCommissionChanges(tx, affectedCategoryIds, category.name);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateDefaultCommission(admin: AuthenticatedUser, percent: number) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin access is required.");
  assertCommissionPercent(percent);
  return prisma.$transaction(async (tx) => {
    const [priorSettings, rules, categories] = await Promise.all([
      tx.commissionSettings.findUniqueOrThrow({ where: { id: "default" } }),
      tx.categoryCommission.findMany(),
      tx.category.findMany({ select: { id: true, parentId: true } }),
    ]);
    const beforeCategories: CommissionCategory[] = categories.map((item) => {
      const rule = rules.find((candidate) => candidate.categoryId === item.id);
      return { id: item.id, parentId: item.parentId, commission: rule ? { percent: rule.percent, isActive: rule.isActive } : null };
    });
    const afterCategories = categories.filter((item) => effectiveCommissionSource(item.id, beforeCategories) === null);
    const updated = await tx.commissionSettings.update({
      where: { id: "default" },
      data: { defaultPercent: percent, updatedById: admin.id },
    });
    await tx.categoryCommissionHistory.create({
      data: {
        categoryName: "Default commission",
        previousPercent: priorSettings.defaultPercent,
        percent: updated.defaultPercent,
        isActive: true,
        changedById: admin.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "DEFAULT_COMMISSION_UPDATED",
        entityType: "CommissionSettings",
        metadata: { previousPercent: priorSettings.defaultPercent.toString(), percent: updated.defaultPercent.toString() },
      },
    });
    await notifyVendorsForCommissionChanges(tx, afterCategories.map((item) => item.id), "categories using the default rate");
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordPaidVendorOrderLedger(
  tx: Prisma.TransactionClient,
  vendorOrderId: string,
) {
  const vendorOrder = await tx.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    include: {
      lines: true,
      order: { select: { id: true, orderNumber: true, currency: true, paymentStatus: true, status: true } },
      couponRedemptions: {
        where: { coupon: { scope: "VENDOR" } },
        select: { couponId: true },
        take: 1,
      },
    },
  });
  if (!vendorOrder) throw new AppError("ORDER_NOT_FOUND", 404, "Vendor order not found.");
  if (vendorOrder.order.paymentStatus !== "SUCCEEDED" || vendorOrder.order.status !== "PAID") {
    throw new AppError("ORDER_NOT_FINANCIALLY_ELIGIBLE", 409, "A successfully paid order is required before recording vendor earnings.");
  }
  if (vendorOrder.lines.some((line) => line.commissionPercent === null || line.commissionAmount === null)) {
    throw new AppError("COMMISSION_SNAPSHOT_MISSING", 409, "This order is missing its original commission snapshot and must be reconciled before posting earnings.");
  }

  const productSales = vendorOrder.lines.reduce(
    (total, line) => total.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const commissionTotal = vendorOrder.lines.reduce(
    (total, line) => total.add(line.commissionAmount ?? 0),
    new Prisma.Decimal(0),
  );
  const couponId = vendorOrder.couponRedemptions[0]?.couponId ?? null;
  const entries: Prisma.LedgerEntryCreateManyInput[] = [
    {
      vendorId: vendorOrder.vendorId,
      orderId: vendorOrder.order.id,
      vendorOrderId,
      type: "SALE",
      amount: productSales,
      currency: vendorOrder.order.currency,
      description: `Product sales for order ${vendorOrder.order.orderNumber}.`,
      idempotencyKey: `SALE:${vendorOrderId}`,
      simulated: true,
    },
    {
      vendorId: vendorOrder.vendorId,
      orderId: vendorOrder.order.id,
      vendorOrderId,
      type: "COMMISSION",
      amount: commissionTotal.neg(),
      currency: vendorOrder.order.currency,
      description: `Commission from the order-line commission snapshots for ${vendorOrder.order.orderNumber}.`,
      idempotencyKey: `COMMISSION:${vendorOrderId}`,
      simulated: true,
    },
  ];

  if (new Prisma.Decimal(vendorOrder.deliveryFee).gt(0)) {
    entries.push({
      vendorId: vendorOrder.vendorId,
      orderId: vendorOrder.order.id,
      vendorOrderId,
      type: "DELIVERY_FEE",
      amount: vendorOrder.deliveryFee,
      currency: vendorOrder.order.currency,
      description: `Delivery fee for order ${vendorOrder.order.orderNumber}; excluded from product sales and commission.`,
      idempotencyKey: `DELIVERY_FEE:${vendorOrderId}`,
      simulated: true,
    });
  }
  if (new Prisma.Decimal(vendorOrder.discountAmount).gt(0)) {
    entries.push({
      vendorId: vendorOrder.vendorId,
      orderId: vendorOrder.order.id,
      vendorOrderId,
      couponId,
      type: "VENDOR_DISCOUNT",
      amount: new Prisma.Decimal(vendorOrder.discountAmount).neg(),
      currency: vendorOrder.order.currency,
      description: `Vendor-funded coupon discount for order ${vendorOrder.order.orderNumber}.`,
      idempotencyKey: `VENDOR_DISCOUNT:${vendorOrderId}`,
      simulated: true,
    });
  }

  const result = await tx.ledgerEntry.createMany({ data: entries, skipDuplicates: true });
  return { entriesRecorded: result.count, simulated: true };
}

export async function recordDeliveryLedger(vendorOrderId: string) {
  return prisma.$transaction(
    (tx) => recordPaidVendorOrderLedger(tx, vendorOrderId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function findEligibleOpenEntries(
  client: Prisma.TransactionClient | typeof prisma,
  cutoff: Date,
) {
  return client.ledgerEntry.findMany({
    where: {
      NOT: { vendorId: null },
      payoutId: null,
      payoutAllocations: { none: { releasedAt: null } },
      OR: [
        {
          type: { in: [...sourceTypes] },
          vendorOrder: {
            is: {
              status: "DELIVERED",
              deliveredAt: { lt: cutoff },
              order: { is: { status: "PAID", paymentStatus: "SUCCEEDED" } },
              lines: { none: { returns: { some: { status: { in: [...unresolvedReturnStatuses] } } } } },
            },
          },
        },
        { type: { in: [...balanceAdjustmentTypes] } },
      ],
    },
    include: {
      vendorOrder: {
        select: {
          id: true,
          deliveredAt: true,
          status: true,
          order: { select: { orderNumber: true, paymentStatus: true, status: true } },
          lines: {
            select: {
              productName: true,
              unitPrice: true,
              quantity: true,
              commissionPercent: true,
              commissionAmount: true,
              returns: { where: { status: { in: [...unresolvedReturnStatuses] } }, select: { id: true }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function findOpenOrderEntries(client: Prisma.TransactionClient | typeof prisma) {
  return client.ledgerEntry.findMany({
    where: {
      vendorId: { not: null },
      payoutId: null,
      payoutAllocations: { none: { releasedAt: null } },
      type: { in: [...sourceTypes] },
      vendorOrder: {
        is: {
          status: { notIn: ["CANCELLED", "EXPIRED"] },
          order: { is: { status: "PAID", paymentStatus: "SUCCEEDED" } },
        },
      },
    },
    include: {
      vendorOrder: {
        select: {
          id: true,
          status: true,
          deliveredAt: true,
          order: { select: { orderNumber: true, paymentStatus: true, status: true } },
          lines: {
            select: {
              productName: true,
              unitPrice: true,
              quantity: true,
              commissionPercent: true,
              commissionAmount: true,
              returns: { where: { status: { in: [...unresolvedReturnStatuses] } }, select: { id: true }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

function summarizeEligibleEntries(entries: Awaited<ReturnType<typeof findEligibleOpenEntries>>) {
  return summarizeLedgerEntriesByVendorCurrency(entries)
    .filter((item) => item.amount.gt(0));
}

type PayoutOrderEntry = Awaited<ReturnType<typeof findOpenOrderEntries>>[number];

function summarizePayoutOrders(entries: PayoutOrderEntry[], cutoff: Date, holdMs: number) {
  const grouped = new Map<string, PayoutOrderEntry[]>();
  for (const entry of entries) {
    if (!entry.vendorOrder) continue;
    const group = grouped.get(entry.vendorOrder.id) ?? [];
    group.push(entry);
    grouped.set(entry.vendorOrder.id, group);
  }

  return [...grouped.values()].map((orderEntries) => {
    const vendorOrder = orderEntries[0]!.vendorOrder!;
    const reason = vendorOrderPayoutPendingReason({
      paymentStatus: vendorOrder.order.paymentStatus,
      orderStatus: vendorOrder.order.status,
      vendorStatus: vendorOrder.status,
      deliveredAt: vendorOrder.deliveredAt,
      cutoff,
      hasBlockingReturn: vendorOrder.lines.some((line) => line.returns.length > 0),
    });
    const grossSales = vendorOrder.lines.reduce(
      (total, line) => total.add(lineGross(line.unitPrice, line.quantity)),
      new Prisma.Decimal(0),
    );
    const commission = vendorOrder.lines.reduce(
      (total, line) => total.add(line.commissionAmount ?? 0),
      new Prisma.Decimal(0),
    );
    return {
      vendorOrderId: vendorOrder.id,
      orderNumber: vendorOrder.order.orderNumber,
      currency: orderEntries[0]!.currency,
      grossSales: money(grossSales),
      commission: money(commission),
      vendorNetEarnings: money(sumLedgerAmounts(orderEntries)),
      products: vendorOrder.lines.map((line) => ({
        name: line.productName,
        quantity: line.quantity,
        grossSales: money(lineGross(line.unitPrice, line.quantity)),
        commissionRate: line.commissionPercent?.toString() ?? null,
        commission: line.commissionAmount === null ? null : money(line.commissionAmount),
      })),
      deliveryStatus: vendorOrder.status,
      deliveredAt: vendorOrder.deliveredAt?.toISOString() ?? null,
      eligibilityDate: vendorOrder.deliveredAt
        ? new Date(vendorOrder.deliveredAt.getTime() + holdMs).toISOString()
        : null,
      pendingReason: reason,
    };
  });
}

export async function previewPayoutBalances(now = new Date(), holdDays?: number) {
  const holdMs = payoutHoldDuration(holdDays);
  const cutoff = payoutHoldCutoff(now, holdMs);
  const [entries, openEntries] = await Promise.all([
    findEligibleOpenEntries(prisma, cutoff),
    findOpenOrderEntries(prisma),
  ]);
  const summaries = summarizeEligibleEntries(entries);
  const pendingEntries = openEntries.filter((entry) => entry.vendorOrder && !vendorOrderPayoutEligible({
    paymentStatus: entry.vendorOrder.order.paymentStatus,
    orderStatus: entry.vendorOrder.order.status,
    vendorStatus: entry.vendorOrder.status,
    deliveredAt: entry.vendorOrder.deliveredAt,
    cutoff,
    hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
  }));
  const pendingSummaries = summarizeLedgerEntriesByVendorCurrency(pendingEntries)
    .filter((item) => item.amount.gt(0));
  const ordersByVendorOrderId = new Map(
    summarizePayoutOrders([...entries, ...pendingEntries], cutoff, holdMs)
      .map((order) => [order.vendorOrderId, order]),
  );
  const eligibleOrdersByVendor = new Map<string, ReturnType<typeof summarizePayoutOrders>>();
  for (const item of summaries) {
    eligibleOrdersByVendor.set(
      `${item.vendorId}:${item.currency}`,
      item.orderIds.flatMap((id) => {
        const order = ordersByVendorOrderId.get(id);
        return order ? [order] : [];
      }),
    );
  }
  const pendingOrdersByVendor = new Map<string, ReturnType<typeof summarizePayoutOrders>>();
  for (const order of summarizePayoutOrders(pendingEntries, cutoff, holdMs)) {
    const vendorId = pendingEntries.find((entry) => entry.vendorOrder?.id === order.vendorOrderId)?.vendorId;
    if (!vendorId) continue;
    const key = `${vendorId}:${order.currency}`;
    pendingOrdersByVendor.set(key, [...(pendingOrdersByVendor.get(key) ?? []), order]);
  }
  const upcoming = new Map<string, { nextEligibleAt: Date | null; awaitingDelivery: boolean }>();
  for (const entry of pendingEntries) {
    if (!entry.vendorId || !entry.vendorOrder) continue;
    const key = `${entry.vendorId}:${entry.currency}`;
    const state = upcoming.get(key) ?? { nextEligibleAt: null, awaitingDelivery: false };
    const reason = vendorOrderPayoutPendingReason({
      paymentStatus: entry.vendorOrder.order.paymentStatus,
      orderStatus: entry.vendorOrder.order.status,
      vendorStatus: entry.vendorOrder.status,
      deliveredAt: entry.vendorOrder.deliveredAt,
      cutoff,
      hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
    });
    if (reason === "AWAITING_DELIVERY") {
      state.awaitingDelivery = true;
    } else if (reason === "SEVEN_DAY_HOLD" && entry.vendorOrder.deliveredAt) {
      const eligibleAt = new Date(entry.vendorOrder.deliveredAt.getTime() + holdMs);
      if (!state.nextEligibleAt || eligibleAt < state.nextEligibleAt) state.nextEligibleAt = eligibleAt;
    }
    upcoming.set(key, state);
  }
  const vendors = await prisma.user.findMany({
    where: { id: { in: [...new Set([...summaries, ...pendingSummaries].map((item) => item.vendorId))] } },
    select: { id: true, displayName: true, email: true, vendorProfile: { select: { storeName: true } } },
  });
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  return {
    cutoff: cutoff.toISOString(),
    totalAmounts: totalsByCurrency(summaries),
    vendorCount: new Set(summaries.map((item) => item.vendorId)).size,
    payouts: summaries.map((item) => ({
      vendorId: item.vendorId,
      currency: item.currency,
      storeName: vendorsById.get(item.vendorId)?.vendorProfile?.storeName ?? null,
      vendorName: vendorsById.get(item.vendorId)?.displayName ?? null,
      email: vendorsById.get(item.vendorId)?.email ?? null,
      amount: money(item.amount),
      orderCount: item.orderIds.length,
      entryCount: item.entryIds.length,
      orders: eligibleOrdersByVendor.get(`${item.vendorId}:${item.currency}`) ?? [],
    })),
    pendingPayouts: pendingSummaries.map((item) => ({
      vendorId: item.vendorId,
      currency: item.currency,
      storeName: vendorsById.get(item.vendorId)?.vendorProfile?.storeName ?? null,
      vendorName: vendorsById.get(item.vendorId)?.displayName ?? null,
      amount: money(item.amount),
      orderCount: item.orderIds.length,
      nextEligibleAt: upcoming.get(`${item.vendorId}:${item.currency}`)?.nextEligibleAt?.toISOString() ?? null,
      awaitingDelivery: upcoming.get(`${item.vendorId}:${item.currency}`)?.awaitingDelivery ?? false,
      orders: pendingOrdersByVendor.get(`${item.vendorId}:${item.currency}`) ?? [],
    })),
    simulated: true,
  };
}

export async function createWeeklyPayoutBatch(actorId: string | null, now = new Date(), holdDays?: number) {
  const periodStart = weekStartUtc(now);
  const baseWeekKey = payoutWeekKey(periodStart);
  const cutoff = payoutHoldCutoff(now, payoutHoldDuration(holdDays));

  try {
    return await prisma.$transaction(async (tx) => {
      const latestBatch = await tx.payoutBatch.findFirst({
        where: { weekKey: { startsWith: baseWeekKey } },
        orderBy: { createdAt: "desc" },
        include: { payouts: { select: { id: true } } },
      });
      if (latestBatch && latestBatch.status !== "CANCELLED" &&
        (latestBatch.status !== "PENDING" || latestBatch.payouts.length > 0)) {
        return tx.payoutBatch.findUniqueOrThrow({
          where: { id: latestBatch.id },
          include: { payouts: { select: { id: true, vendorId: true, reference: true, amount: true, currency: true, status: true } } },
        });
      }
      const batchCount = await tx.payoutBatch.count({ where: { weekKey: { startsWith: baseWeekKey } } });
      const weekKey = latestBatch?.status === "PENDING"
        ? latestBatch.weekKey
        : batchCount === 0 ? baseWeekKey : `${baseWeekKey}-r${batchCount}`;
      const entries = await findEligibleOpenEntries(tx, cutoff);
      const summaries = summarizeEligibleEntries(entries);
      if (summaries.length === 0) {
        throw new AppError("NO_ELIGIBLE_PAYOUTS", 409, "There are no eligible balances to include in a payout batch.");
      }
      const batch = latestBatch?.status === "PENDING"
        ? await tx.payoutBatch.update({ where: { id: latestBatch.id }, data: { periodEnd: now } })
        : await tx.payoutBatch.create({
          data: {
            weekKey,
            periodStart,
            periodEnd: now,
            createdById: actorId,
            status: "PENDING",
          },
        });

      for (const summary of summaries) {
        const payout = await tx.vendorPayout.create({
          data: {
            vendorId: summary.vendorId,
            batchId: batch.id,
            reference: `SQ-P-${randomBytes(8).toString("hex").toUpperCase()}`,
            periodStart,
            periodEnd: now,
            amount: summary.amount,
            currency: summary.currency,
            status: "PENDING",
            idempotencyKey: `PAYOUT:${weekKey}:${summary.vendorId}:${summary.currency}`,
            simulated: true,
          },
        });
        await tx.payoutAllocation.createMany({
          data: summary.entryIds.map((ledgerEntryId) => ({
            payoutId: payout.id,
            ledgerEntryId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "PAYOUT_BATCH_CREATED",
          entityType: "PayoutBatch",
          entityId: batch.id,
          metadata: { weekKey, vendorCount: summaries.length, simulated: true },
        },
      });
      if (summaries.length > 0) {
        await tx.adminNotification.create({
          data: {
            type: "PAYOUT_BATCH_READY",
            title: "Weekly payout batch ready for review",
            titleSo: "Dufcadda lacag-bixinta toddobaadlaha ah ayaa diyaar u ah dib-u-eegis",
            body: `A simulated payout batch for ${summaries.length} vendors is ready for administrator review.`,
            bodySo: `Dufcad lacag-bixin tijaabo ah oo loogu talagalay ${summaries.length} iibiyeyaal ayaa diyaar u ah dib-u-eegista maamulka.`,
            entityType: "PayoutBatch",
            entityId: batch.id,
            href: "/admin/payouts",
          },
        });
        await tx.vendorNotification.createMany({
          data: summaries.map((summary) => ({
            vendorId: summary.vendorId,
            title: "New earnings are eligible for payout",
            titleSo: "Dakhli cusub ayaa u qalma lacag-bixin",
            body: "Your delivered order balance is included in a pending simulated payout batch. No transfer occurs until an administrator reviews it.",
            bodySo: "Hadhaaga dalabkaaga la gaarsiiyey wuxuu ku jiraa dufcad lacag-bixin tijaabo ah oo sugaysa. Lacag lama wareejinayo ilaa maamule dib u eego.",
            entityType: "PayoutBatch",
            entityId: batch.id,
            href: "/vendor/payouts",
          })),
        });
      }
      return tx.payoutBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: { payouts: { select: { id: true, vendorId: true, reference: true, amount: true, currency: true, status: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      const existing = await prisma.payoutBatch.findFirst({
        where: { weekKey: { startsWith: baseWeekKey } },
        orderBy: { createdAt: "desc" },
        include: { payouts: { select: { id: true, vendorId: true, reference: true, amount: true, currency: true, status: true } } },
      });
      if (existing && existing.status !== "CANCELLED") return existing;
    }
    throw error;
  }
}

export async function listAdminPayoutBatches() {
  const batches = await prisma.payoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      payouts: {
        orderBy: { amount: "desc" },
        include: {
          vendor: { select: { displayName: true, email: true, vendorProfile: { select: { storeName: true } } } },
          allocations: {
            include: {
              ledgerEntry: {
                select: {
                  id: true,
                  type: true,
                  amount: true,
                  currency: true,
                  vendorOrderId: true,
                  order: { select: { orderNumber: true, status: true, paymentStatus: true } },
                  vendorOrder: {
                    select: {
                      id: true,
                      status: true,
                      deliveredAt: true,
                      order: { select: { orderNumber: true } },
                      lines: {
                        select: {
                          productName: true,
                          unitPrice: true,
                          quantity: true,
                          commissionPercent: true,
                          commissionAmount: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  return {
    batches: batches.map((batch) => ({
      id: batch.id,
      weekKey: batch.weekKey,
      periodStart: batch.periodStart.toISOString(),
      periodEnd: batch.periodEnd.toISOString(),
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      approvedAt: batch.approvedAt?.toISOString() ?? null,
      processedAt: batch.processedAt?.toISOString() ?? null,
      totalAmounts: totalsByCurrency(batch.payouts.filter((payout) => payout.status !== "CANCELLED")),
      vendorCount: new Set(batch.payouts.filter((payout) => payout.status !== "CANCELLED").map((payout) => payout.vendorId)).size,
      payouts: batch.payouts.map((payout) => {
        const orderGroups = new Map<string, typeof payout.allocations>();
        for (const allocation of payout.allocations) {
          const entry = allocation.ledgerEntry;
          const key = entry.vendorOrderId ?? entry.order?.orderNumber ?? entry.id;
          const group = orderGroups.get(key) ?? [];
          group.push(allocation);
          orderGroups.set(key, group);
        }
        return {
        id: payout.id,
        vendorId: payout.vendorId,
        vendorName: payout.vendor.vendorProfile?.storeName ?? payout.vendor.displayName ?? payout.vendor.email,
        reference: payout.reference,
        amount: money(payout.amount),
        currency: payout.currency,
        status: payout.status,
        failureReason: payout.failureReason,
        grossSales: money(sumLedgerAmounts(payout.allocations
          .filter((allocation) => allocation.ledgerEntry.type === "SALE")
          .map((allocation) => allocation.ledgerEntry))),
        commission: money(sumLedgerAmounts(payout.allocations
          .filter((allocation) => allocation.ledgerEntry.type === "COMMISSION")
          .map((allocation) => allocation.ledgerEntry)).abs()),
        vendorDiscounts: money(sumLedgerAmounts(payout.allocations
          .filter((allocation) => allocation.ledgerEntry.type === "VENDOR_DISCOUNT")
          .map((allocation) => allocation.ledgerEntry)).abs()),
        refunds: money(sumLedgerAmounts(payout.allocations
          .filter((allocation) => allocation.ledgerEntry.type === "REFUND" || allocation.ledgerEntry.type === "REFUND_ADJUSTMENT")
          .map((allocation) => allocation.ledgerEntry)).abs()),
        deliveryFees: money(sumLedgerAmounts(payout.allocations
          .filter((allocation) => allocation.ledgerEntry.type === "DELIVERY_FEE")
          .map((allocation) => allocation.ledgerEntry))),
        orders: [...orderGroups.values()].map((allocations) => {
          const first = allocations[0]!.ledgerEntry;
          const order = first.vendorOrder;
          const products = order?.lines ?? [];
          return {
            vendorOrderId: order?.id ?? first.vendorOrderId,
            orderNumber: order?.order.orderNumber ?? first.order?.orderNumber ?? null,
            currency: first.currency,
            grossSales: money(sumLedgerAmounts(allocations
              .filter((allocation) => allocation.ledgerEntry.type === "SALE")
              .map((allocation) => allocation.ledgerEntry))),
            commission: money(sumLedgerAmounts(allocations
              .filter((allocation) => allocation.ledgerEntry.type === "COMMISSION")
              .map((allocation) => allocation.ledgerEntry)).abs()),
            vendorNetEarnings: money(sumLedgerAmounts(allocations.map((allocation) => allocation.ledgerEntry))),
            deliveryStatus: order?.status ?? "UNKNOWN",
            deliveredAt: order?.deliveredAt?.toISOString() ?? null,
            products: products.map((line) => ({
              name: line.productName,
              quantity: line.quantity,
              commissionRate: line.commissionPercent?.toString() ?? null,
              commission: line.commissionAmount === null ? null : money(line.commissionAmount),
            })),
          };
        }),
      };
      }),
    })),
  };
}

export async function approvePayoutBatch(
  admin: AuthenticatedUser,
  batchId: string,
  holdDays?: number,
  adapter: PayoutAdapter = simulatedPayoutAdapter,
) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin access is required.");
  const holdMs = payoutHoldDuration(holdDays);
  return prisma.$transaction(async (tx) => {
    const locks = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payout_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE`;
    if (locks.length === 0) throw new AppError("PAYOUT_BATCH_NOT_FOUND", 404, "Payout batch not found.");
    const batch = await tx.payoutBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { payouts: true },
    });
    if (batch.status !== "PENDING") throw new AppError("PAYOUT_BATCH_NOT_PENDING", 409, "Only pending payout batches can be approved.");
    if (batch.payouts.length === 0) throw new AppError("PAYOUT_BATCH_EMPTY", 409, "A payout batch with no vendors cannot be approved.");
    if (batch.payouts.some((payout) => payout.status !== "PENDING")) {
      throw new AppError("PAYOUT_STATE_INVALID", 409, "The batch contains a payout that is not pending.");
    }

    const vendorIds = batch.payouts.map((payout) => payout.vendorId);
    const now = new Date();
    const cutoff = payoutHoldCutoff(now, holdMs);
    const newerEligible = await findEligibleOpenEntries(tx, cutoff);
    if (newerEligible.some((entry) => entry.vendorId && vendorIds.includes(entry.vendorId) && entry.createdAt > batch.createdAt)) {
      throw new AppError("PAYOUT_BATCH_STALE", 409, "New financial entries exist since this batch was previewed. Cancel it and create a fresh batch before approval.");
    }

    const paidAmounts: Array<{ currency: string; amount: Prisma.Decimal }> = [];
    let failedCount = 0;
    for (const payout of batch.payouts) {
      const allocations = await tx.payoutAllocation.findMany({
        where: { payoutId: payout.id, releasedAt: null },
        include: {
          ledgerEntry: {
            select: {
              id: true,
              amount: true,
              currency: true,
              vendorId: true,
              vendorOrder: {
                select: {
                  status: true,
                  deliveredAt: true,
                  order: { select: { paymentStatus: true, status: true } },
                  lines: {
                    select: {
                      returns: {
                        where: { status: { in: [...unresolvedReturnStatuses] } },
                        select: { id: true },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const assignedEntries = allocations.map((allocation) => allocation.ledgerEntry);
      if (assignedEntries.some((entry) => entry.currency !== payout.currency || entry.vendorId !== payout.vendorId)) {
        throw new AppError("PAYOUT_CURRENCY_MISMATCH", 409, "A payout cannot combine different currencies.");
      }
      const currentBalance = sumLedgerAmounts(assignedEntries);
      if (!currentBalance.eq(payout.amount) || currentBalance.lte(0) ||
        assignedEntries.some((entry) => entry.vendorOrder && !vendorOrderPayoutEligible({
          paymentStatus: entry.vendorOrder.order.paymentStatus,
          orderStatus: entry.vendorOrder.order.status,
          vendorStatus: entry.vendorOrder.status,
          deliveredAt: entry.vendorOrder.deliveredAt,
          cutoff,
          hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
        }))) {
        throw new AppError("PAYOUT_BALANCE_CHANGED", 409, "A payout balance is no longer eligible. Cancel the batch and create a fresh preview.");
      }

      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: { status: "PROCESSING", approvedById: admin.id, approvedAt: now },
      });
      const adapterResult = await adapter.processPayout({
        payoutId: payout.id,
        vendorId: payout.vendorId,
        amount: money(payout.amount),
        currency: payout.currency,
        idempotencyKey: `PAYOUT:${payout.id}`,
      });
      if (!adapterResult.simulated) {
        throw new AppError("REAL_PAYOUT_DISABLED", 403, "Real payouts are disabled; only simulated payouts are supported.");
      }
      if (adapterResult.status === "FAILED") {
        failedCount += 1;
        await tx.vendorPayout.update({
          where: { id: payout.id },
          data: { status: "FAILED", failureReason: adapterResult.failureReason ?? "SIMULATED_PAYOUT_FAILED" },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: admin.id,
            action: "PAYOUT_SIMULATED_FAILED",
            entityType: "VendorPayout",
            entityId: payout.id,
            metadata: { reference: payout.reference, amount: money(payout.amount), currency: payout.currency, simulated: true },
          },
        });
        continue;
      }
      await tx.ledgerEntry.create({
        data: {
          vendorId: payout.vendorId,
          payoutId: payout.id,
          type: "PAYOUT",
          amount: payout.amount.neg(),
          currency: payout.currency,
          description: `Simulated payout ${payout.reference ?? payout.id}. No real transfer was made.`,
          idempotencyKey: `PAYOUT:${payout.id}`,
          simulated: true,
        },
      });
      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: { status: "SIMULATED_PAID", processedAt: now },
      });
      await tx.vendorNotification.create({
        data: {
          vendorId: payout.vendorId,
          title: "Simulated payout completed",
          titleSo: "Lacag-bixin tijaabo ah waa la dhammaystiray",
          body: `A simulated payout of ${payout.currency} ${money(payout.amount)} was recorded. No real money was transferred.`,
          bodySo: `Lacag-bixin tijaabo ah oo ah ${payout.currency} ${money(payout.amount)} ayaa la diiwaangeliyey. Lacag dhab ah lama wareejin.`,
          entityType: "VendorPayout",
          entityId: payout.id,
          href: "/vendor/payouts",
        },
      });
      paidAmounts.push({ currency: payout.currency, amount: payout.amount });
    }

    const batchStatus = failedCount > 0 ? "FAILED" : "SIMULATED_PAID";
    await tx.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status: batchStatus,
        approvedById: admin.id,
        approvedAt: now,
        ...(failedCount === 0 ? { processedAt: now } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: failedCount > 0 ? "PAYOUT_BATCH_SIMULATED_PARTIAL_FAILURE" : "PAYOUT_BATCH_SIMULATED_APPROVED",
        entityType: "PayoutBatch",
        entityId: batch.id,
        metadata: { totalAmounts: totalsByCurrency(paidAmounts), vendorCount: batch.payouts.length, failedCount, simulated: true },
      },
    });
    return {
      batchId: batch.id,
      status: batchStatus,
      totalAmounts: totalsByCurrency(paidAmounts),
      vendorCount: batch.payouts.length,
      failedCount,
      simulated: true,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function retryFailedVendorPayout(
  admin: AuthenticatedUser,
  payoutId: string,
  holdDays?: number,
  adapter: PayoutAdapter = simulatedPayoutAdapter,
) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin access is required.");
  const holdMs = payoutHoldDuration(holdDays);
  return prisma.$transaction(async (tx) => {
    const locks = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "vendor_payouts" WHERE "id" = ${payoutId}::uuid FOR UPDATE
    `;
    if (locks.length === 0) throw new AppError("PAYOUT_NOT_FOUND", 404, "Vendor payout not found.");

    const payout = await tx.vendorPayout.findUniqueOrThrow({
      where: { id: payoutId },
      include: {
        allocations: {
          where: { releasedAt: null },
          include: {
            ledgerEntry: {
              select: {
                id: true,
                amount: true,
                currency: true,
                vendorId: true,
                vendorOrder: {
                  select: {
                    status: true,
                    deliveredAt: true,
                    order: { select: { status: true, paymentStatus: true } },
                    lines: {
                      select: {
                        returns: {
                          where: { status: { in: [...unresolvedReturnStatuses] } },
                          select: { id: true },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        entries: { where: { type: "PAYOUT" }, select: { id: true } },
      },
    });
    if (payout.status === "SIMULATED_PAID") {
      return { payoutId: payout.id, status: payout.status, simulated: true };
    }
    if (payout.status !== "FAILED") {
      throw new AppError("PAYOUT_NOT_FAILED", 409, "Only failed payouts can be retried.");
    }
    if (payout.entries.length > 0) {
      throw new AppError("PAYOUT_ALREADY_RECORDED", 409, "A payout ledger entry already exists; reconciliation is required before retry.");
    }

    const assignedEntries = payout.allocations.map((allocation) => allocation.ledgerEntry);
    const cutoff = payoutHoldCutoff(new Date(), holdMs);
    const currentBalance = sumLedgerAmounts(assignedEntries);
    if (
      assignedEntries.length === 0 ||
      assignedEntries.some((entry) => entry.currency !== payout.currency || entry.vendorId !== payout.vendorId) ||
      !currentBalance.eq(payout.amount) ||
      currentBalance.lte(0) ||
      assignedEntries.some((entry) => entry.vendorOrder && !vendorOrderPayoutEligible({
        paymentStatus: entry.vendorOrder.order.paymentStatus,
        orderStatus: entry.vendorOrder.order.status,
        vendorStatus: entry.vendorOrder.status,
        deliveredAt: entry.vendorOrder.deliveredAt,
        cutoff,
        hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
      }))
    ) {
      throw new AppError("PAYOUT_BALANCE_CHANGED", 409, "The failed payout is no longer eligible. Reconcile the balance before retrying.");
    }

    const now = new Date();
    await tx.vendorPayout.update({
      where: { id: payout.id },
      data: {
        status: "PROCESSING",
        approvedById: admin.id,
        approvedAt: now,
        failureReason: null,
      },
    });
    const adapterResult = await adapter.processPayout({
      payoutId: payout.id,
      vendorId: payout.vendorId,
      amount: money(payout.amount),
      currency: payout.currency,
      idempotencyKey: `PAYOUT:${payout.id}`,
    });
    if (!adapterResult.simulated) {
      throw new AppError("REAL_PAYOUT_DISABLED", 403, "Real payouts are disabled; only simulated payouts are supported.");
    }
    if (adapterResult.status === "FAILED") {
      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: { status: "FAILED", failureReason: adapterResult.failureReason ?? "SIMULATED_PAYOUT_FAILED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "VENDOR_PAYOUT_RETRY_SIMULATED_FAILED",
          entityType: "VendorPayout",
          entityId: payout.id,
          metadata: { reference: payout.reference, amount: money(payout.amount), currency: payout.currency, simulated: true },
        },
      });
      return { payoutId: payout.id, status: "FAILED", simulated: true };
    }
    await tx.ledgerEntry.create({
      data: {
        vendorId: payout.vendorId,
        payoutId: payout.id,
        type: "PAYOUT",
        amount: payout.amount.neg(),
        currency: payout.currency,
        description: `Retried simulated payout ${payout.reference ?? payout.id}. No real transfer was made.`,
        idempotencyKey: `PAYOUT:${payout.id}`,
        simulated: true,
      },
    });
    await tx.vendorPayout.update({
      where: { id: payout.id },
      data: { status: "SIMULATED_PAID", processedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "VENDOR_PAYOUT_RETRIED_SIMULATED",
        entityType: "VendorPayout",
        entityId: payout.id,
        metadata: { reference: payout.reference, amount: money(payout.amount), currency: payout.currency, simulated: true },
      },
    });
    await tx.vendorNotification.create({
      data: {
        vendorId: payout.vendorId,
        title: "Simulated payout retry completed",
        titleSo: "Dib-u-tijaabinta lacag-bixinta tijaabada ah waa la dhammaystiray",
        body: `A simulated payout of ${payout.currency} ${money(payout.amount)} was recorded. No real money was transferred.`,
        bodySo: `Lacag-bixin tijaabo ah oo ah ${payout.currency} ${money(payout.amount)} ayaa la diiwaangeliyey. Lacag dhab ah lama wareejin.`,
        entityType: "VendorPayout",
        entityId: payout.id,
        href: "/vendor/payouts",
      },
    });

    const remaining = await tx.vendorPayout.count({
      where: {
        batchId: payout.batchId,
        status: { notIn: ["SIMULATED_PAID", "CANCELLED"] },
      },
    });
    if (payout.batchId && remaining === 0) {
      await tx.payoutBatch.update({
        where: { id: payout.batchId },
        data: { status: "SIMULATED_PAID", approvedById: admin.id, approvedAt: now, processedAt: now },
      });
    }
    return { payoutId: payout.id, status: "SIMULATED_PAID", simulated: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelPayoutBatch(admin: AuthenticatedUser, batchId: string) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin access is required.");
  return prisma.$transaction(async (tx) => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: batchId },
      include: { payouts: { select: { id: true, status: true } } },
    });
    if (!batch) throw new AppError("PAYOUT_BATCH_NOT_FOUND", 404, "Payout batch not found.");
    if (batch.status !== "PENDING") throw new AppError("PAYOUT_BATCH_NOT_PENDING", 409, "Only pending payout batches can be cancelled.");
    if (batch.payouts.some((payout) => payout.status !== "PENDING")) {
      throw new AppError("PAYOUT_STATE_INVALID", 409, "The batch contains a payout that is not pending.");
    }
    const payoutIds = batch.payouts.map((payout) => payout.id);
    await tx.payoutAllocation.updateMany({
      where: { payoutId: { in: payoutIds }, releasedAt: null },
      data: { releasedAt: new Date(), releaseReason: "Payout batch cancelled by administrator." },
    });
    await tx.vendorPayout.updateMany({
      where: { batchId: batch.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.payoutBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({
      data: { actorUserId: admin.id, action: "PAYOUT_BATCH_CANCELLED", entityType: "PayoutBatch", entityId: batch.id },
    });
    return { batchId: batch.id, status: "CANCELLED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type VendorFinancialFilters = {
  from?: Date;
  to?: Date;
  type?: string;
  orderNumber?: string;
  payoutStatus?: string;
  cursor?: string;
  limit?: number;
};

export async function getVendorFinancialStatement(vendorId: string, filters: VendorFinancialFilters = {}) {
  const cutoff = new Date(Date.now() - PAYOUT_HOLD_MS);
  const [allEntries, pageEntries, vendor] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { vendorId },
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        payoutId: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
        orderLine: { select: { productName: true, commissionPercent: true, commissionAmount: true } },
        vendorOrder: {
          select: {
            id: true,
            status: true,
            deliveredAt: true,
            order: { select: { orderNumber: true, status: true, paymentStatus: true } },
            lines: {
              select: {
                productName: true,
                unitPrice: true,
                quantity: true,
                commissionPercent: true,
                commissionAmount: true,
                returns: { where: { status: { in: [...unresolvedReturnStatuses] } }, select: { id: true, status: true }, take: 1 },
              },
            },
          },
        },
        payoutAllocations: {
          where: { releasedAt: null },
          select: { payout: { select: { reference: true, status: true, batchId: true, batch: { select: { weekKey: true } } } } },
          take: 1,
        },
        payout: { select: { reference: true, status: true, batchId: true, batch: { select: { weekKey: true } } } },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        vendorId,
        ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
        ...(filters.type ? { type: filters.type as never } : {}),
        ...(filters.orderNumber ? { order: { is: { orderNumber: { contains: filters.orderNumber, mode: "insensitive" } } } } : {}),
        ...(filters.payoutStatus === "UNPAID"
          ? { payoutId: null, payoutAllocations: { none: { releasedAt: null } } }
          : filters.payoutStatus
            ? {
              OR: [
                { payout: { is: { status: filters.payoutStatus as never } } },
                { payoutAllocations: { some: { releasedAt: null, payout: { is: { status: filters.payoutStatus as never } } } } },
              ],
            }
            : {}),
      },
      include: {
        order: { select: { orderNumber: true } },
        vendorOrder: {
          select: {
            id: true,
            status: true,
            deliveredAt: true,
            order: { select: { orderNumber: true, status: true, paymentStatus: true } },
            lines: {
              select: {
                productName: true,
                unitPrice: true,
                quantity: true,
                commissionPercent: true,
                commissionAmount: true,
                returns: { where: { status: { in: [...unresolvedReturnStatuses] } }, select: { id: true }, take: 1 },
              },
            },
          },
        },
        orderLine: { select: { commissionPercent: true, productName: true } },
        coupon: { select: { code: true } },
        payout: { select: { reference: true, status: true, batchId: true, batch: { select: { weekKey: true } } } },
        payoutAllocations: {
          where: { releasedAt: null },
          select: { payout: { select: { reference: true, status: true, batchId: true, batch: { select: { weekKey: true } } } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 50, 1), 100),
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: vendorId },
      select: { displayName: true, vendorProfile: { select: { storeName: true } } },
    }),
  ]);
  const isUnreserved = (entry: typeof allEntries[number]) =>
    entry.payoutId === null && entry.payoutAllocations.length === 0;
  const isOrderPayoutEligible = (entry: typeof allEntries[number]) =>
    entry.vendorOrder !== null && vendorOrderPayoutEligible({
      paymentStatus: entry.vendorOrder.order.paymentStatus,
      orderStatus: entry.vendorOrder.order.status,
      vendorStatus: entry.vendorOrder.status,
      deliveredAt: entry.vendorOrder.deliveredAt,
      cutoff,
      hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
    });
  const pendingEntries = allEntries.filter((entry) =>
    isUnreserved(entry) &&
    sourceTypes.includes(entry.type as typeof sourceTypes[number]) &&
    (!entry.vendorOrder || !isOrderPayoutEligible(entry)),
  );
  const financialSummary = summarizeVendorLedger(allEntries.map((entry) => {
    const activePayout = entry.payoutAllocations.some((allocation) =>
      ["PENDING", "APPROVED", "PROCESSING", "FAILED"].includes(allocation.payout.status),
    );
    const bucket = activePayout
      ? "PROCESSING" as const
      : isUnreserved(entry) && sourceTypes.includes(entry.type as typeof sourceTypes[number])
        ? (!entry.vendorOrder || !isOrderPayoutEligible(entry) ? "PENDING" as const : "ELIGIBLE" as const)
        : isUnreserved(entry) && balanceAdjustmentTypes.includes(entry.type as typeof balanceAdjustmentTypes[number])
          ? "ELIGIBLE" as const
          : undefined;
    return { type: entry.type, amount: entry.amount, currency: entry.currency, bucket };
  }));
  const pendingOrderGroups = new Map<string, typeof allEntries>();
  for (const entry of pendingEntries) {
    const key = entry.vendorOrder?.id ?? `${entry.order?.orderNumber ?? "unlinked"}:${entry.currency}`;
    const group = pendingOrderGroups.get(key) ?? [];
    group.push(entry);
    pendingOrderGroups.set(key, group);
  }
  const pendingOrders = [...pendingOrderGroups.values()].map((entries) => {
    const first = entries[0]!;
    const vendorOrder = first.vendorOrder;
    const hasBlockingReturn = vendorOrder?.lines.some((line) => line.returns.length > 0) ?? false;
    const reason = vendorOrder
      ? vendorOrderPayoutPendingReason({
        paymentStatus: vendorOrder.order.paymentStatus,
        orderStatus: vendorOrder.order.status,
        vendorStatus: vendorOrder.status,
        deliveredAt: vendorOrder.deliveredAt,
        cutoff,
        hasBlockingReturn,
      }) ?? "ORDER_RECONCILIATION_REQUIRED"
      : "ORDER_RECONCILIATION_REQUIRED";
    const products = vendorOrder?.lines ?? [];
    const commission = products.reduce(
      (total, line) => total.add(line.commissionAmount ?? 0),
      new Prisma.Decimal(0),
    );
    const grossSales = products.reduce(
      (total, line) => total.add(lineGross(line.unitPrice, line.quantity)),
      new Prisma.Decimal(0),
    );
    return {
      orderNumber: vendorOrder?.order.orderNumber ?? first.order?.orderNumber ?? null,
      currency: first.currency,
      vendorOrderId: vendorOrder?.id ?? null,
      grossSales: money(grossSales),
      commission: money(commission),
      vendorNetEarnings: money(sumLedgerAmounts(entries)),
      products: products.map((line) => ({
        name: line.productName,
        quantity: line.quantity,
        grossSales: money(lineGross(line.unitPrice, line.quantity)),
        commissionRate: line.commissionPercent?.toString() ?? null,
        commission: line.commissionAmount === null ? null : money(line.commissionAmount),
      })),
      deliveryStatus: vendorOrder?.status ?? "UNKNOWN",
      deliveredAt: vendorOrder?.deliveredAt?.toISOString() ?? null,
      eligibilityDate: vendorOrder?.deliveredAt
        ? new Date(vendorOrder.deliveredAt.getTime() + PAYOUT_HOLD_MS).toISOString()
        : null,
      pendingReason: reason,
      blockingReturnStatuses: vendorOrder?.lines.flatMap((line) => line.returns.map((request) => request.status)) ?? [],
    };
  });

  const nextCursor = pageEntries.length === Math.min(Math.max(filters.limit ?? 50, 1), 100)
    ? pageEntries.at(-1)?.id ?? null
    : null;
  return {
    vendorName: vendor.vendorProfile?.storeName ?? vendor.displayName ?? "",
    summary: {
      ...financialSummary,
      deliveryFees: totalsByCurrency(allEntries.filter((entry) => entry.type === "DELIVERY_FEE")),
      simulated: true,
    },
    pendingOrders,
    entries: pageEntries.map((entry) => {
      const payout = entry.payoutAllocations[0]?.payout ?? entry.payout;
      const payoutStatus = payout?.status === "PENDING"
        ? (payout.batchId ? "BATCH_CREATED" : "PENDING")
        : payout?.status === "APPROVED" || payout?.status === "PROCESSING"
          ? "PROCESSING"
          : payout?.status ?? (entry.payoutId ? "SIMULATED_PAID"
            : balanceAdjustmentTypes.includes(entry.type as typeof balanceAdjustmentTypes[number]) ? "ELIGIBLE"
              : sourceTypes.includes(entry.type as typeof sourceTypes[number]) && entry.vendorOrder
                ? (vendorOrderPayoutEligible({
                  paymentStatus: entry.vendorOrder.order.paymentStatus,
                  orderStatus: entry.vendorOrder.order.status,
                  vendorStatus: entry.vendorOrder.status,
                  deliveredAt: entry.vendorOrder.deliveredAt,
                  cutoff,
                  hasBlockingReturn: entry.vendorOrder.lines.some((line) => line.returns.length > 0),
                }) ? "ELIGIBLE" : "PENDING")
                : "UNPAID");
      return {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        orderNumber: entry.order?.orderNumber ?? entry.vendorOrder?.order.orderNumber ?? null,
        vendorOrderId: entry.vendorOrder?.id ?? null,
        transactionType: entry.type,
        amount: money(entry.amount),
        currency: entry.currency,
        commissionPercent: entry.orderLine?.commissionPercent?.toString() ?? null,
        commissionDetails: entry.vendorOrder?.lines.map((line) => ({
          product: line.productName,
          rate: line.commissionPercent?.toString() ?? null,
          amount: line.commissionAmount === null ? null : money(line.commissionAmount),
        })) ?? [],
        description: entry.description,
        couponCode: entry.coupon?.code ?? null,
        payoutReference: payout?.reference ?? null,
        payoutStatus,
        simulated: entry.simulated,
      };
    }),
    payouts: await prisma.vendorPayout.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        batch: { select: { weekKey: true } },
        entries: { where: { type: { not: "PAYOUT" } }, include: { order: { select: { orderNumber: true } }, vendorOrder: { include: { order: { select: { orderNumber: true } } } } } },
        allocations: {
          where: { releasedAt: null },
          include: {
            ledgerEntry: {
              include: {
                order: { select: { orderNumber: true, status: true, paymentStatus: true } },
                vendorOrder: { include: { order: { select: { orderNumber: true } } } },
              },
            },
          },
        },
      },
    }).then((items) => items.map((payout) => ({
      id: payout.id,
      reference: payout.reference,
      batchReference: payout.batch?.weekKey ?? null,
      date: payout.processedAt?.toISOString() ?? payout.createdAt.toISOString(),
      amount: money(payout.amount),
      currency: payout.currency,
      status: payout.status === "PENDING" && payout.batchId
        ? "BATCH_CREATED"
        : payout.status === "APPROVED" ? "PROCESSING" : payout.status,
      simulated: payout.simulated,
      orderCount: new Set([
        ...payout.entries.map((entry) => entry.vendorOrder?.order.orderNumber ?? entry.order?.orderNumber),
        ...payout.allocations.map((allocation) => allocation.ledgerEntry.vendorOrder?.order.orderNumber ?? allocation.ledgerEntry.order?.orderNumber),
      ].filter((number): number is string => Boolean(number))).size,
      coveredOrders: [...new Set([
        ...payout.entries.map((entry) => entry.vendorOrder?.order.orderNumber ?? entry.order?.orderNumber),
        ...payout.allocations.map((allocation) => allocation.ledgerEntry.vendorOrder?.order.orderNumber ?? allocation.ledgerEntry.order?.orderNumber),
      ].filter((number): number is string => Boolean(number)))],
    }))),
    nextCursor,
  };
}

export async function getFinancialReconciliation() {
  const [vendorOrders, platformOrders, payouts] = await Promise.all([
    prisma.vendorOrder.findMany({
      where: { status: "DELIVERED", order: { status: "PAID", paymentStatus: "SUCCEEDED" } },
      include: {
        vendor: { select: { id: true, displayName: true, email: true, vendorProfile: { select: { storeName: true } } } },
        order: { select: { orderNumber: true, currency: true, paymentStatus: true, status: true } },
        lines: { select: { categoryId: true, unitPrice: true, quantity: true, commissionPercent: true, commissionAmount: true } },
        ledgerEntries: {
          select: {
            type: true,
            amount: true,
            idempotencyKey: true,
            payoutAllocations: { select: { payout: { select: { status: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.marketplaceOrder.findMany({
      where: { paymentStatus: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        payment: { select: { amount: true, status: true, simulated: true } },
        redemptions: {
          where: { coupon: { scope: "PLATFORM" } },
          select: { amount: true, coupon: { select: { code: true } } },
        },
        ledgerEntries: {
          where: { type: "PLATFORM_DISCOUNT" },
          select: { amount: true, currency: true },
        },
      },
    }),
    prisma.vendorPayout.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        entries: { select: { type: true, amount: true, currency: true, vendorId: true } },
        allocations: {
          where: { releasedAt: null },
          include: { ledgerEntry: { select: { type: true, amount: true, currency: true, vendorId: true } } },
        },
      },
    }),
  ]);
  const categoryIds = [...new Set(vendorOrders.flatMap((vendorOrder) =>
    vendorOrder.lines.flatMap((line) => line.categoryId ? [line.categoryId] : []),
  ))];
  const categories = categoryIds.length > 0
    ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const discrepancies = [];
  const vendorOrderReconciliations = [];
  for (const vendorOrder of vendorOrders) {
    const result = reconcilePaidVendorOrder({
      id: vendorOrder.id,
      status: vendorOrder.status,
      discountAmount: vendorOrder.discountAmount,
      deliveryFee: vendorOrder.deliveryFee,
      paymentStatus: vendorOrder.order.paymentStatus,
      orderStatus: vendorOrder.order.status,
      orderNumber: vendorOrder.order.orderNumber,
      lines: vendorOrder.lines,
      ledgerEntries: vendorOrder.ledgerEntries,
    });
    const differences = result.differences;
    const expectedCommission = vendorOrder.lines.some((line) =>
      line.commissionPercent === null || line.commissionAmount === null,
    )
      ? null
      : result.expectedCommission;
    const actualBaseCommission = vendorOrder.ledgerEntries
      .filter((entry) => entry.type === "COMMISSION" && entry.idempotencyKey === `COMMISSION:${vendorOrder.id}`)
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    const baseEntryTypes = new Set(["SALE", "COMMISSION", "VENDOR_DISCOUNT", "DELIVERY_FEE"]);
    const isBaseEntry = (entry: typeof vendorOrder.ledgerEntries[number]) =>
      entry.type === "COMMISSION"
        ? entry.idempotencyKey === `COMMISSION:${vendorOrder.id}`
        : baseEntryTypes.has(entry.type);
    const actualBaseEarnings = vendorOrder.ledgerEntries
      .filter(isBaseEntry)
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    const adjustmentEarnings = vendorOrder.ledgerEntries
      .filter((entry) => !isBaseEntry(entry))
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    const expectedEarnings = expectedCommission === null
      ? null
      : result.expectedSales
        .add(expectedCommission)
        .add(result.expectedDiscount)
        .add(result.expectedDelivery)
        .add(adjustmentEarnings);
    const actualEarnings = actualBaseEarnings.add(adjustmentEarnings);
    const appliedRates = [...new Map(vendorOrder.lines.map((line) => {
      const categoryName = line.categoryId ? categoryNames.get(line.categoryId) : undefined;
      const key = `${line.categoryId ?? "uncategorized"}:${line.commissionPercent?.toString() ?? "missing"}`;
      return [key, {
        category: categoryName ?? (line.categoryId ? "Unknown category" : "Uncategorized"),
        rate: line.commissionPercent?.toString() ?? null,
      }];
    })).values()];
    const payoutStatuses = [...new Set(vendorOrder.ledgerEntries.flatMap((entry) =>
      entry.payoutAllocations.map((allocation) => allocation.payout.status),
    ))];
    const payoutStatus = payoutStatuses.includes("SIMULATED_PAID")
      ? "SIMULATED_PAID"
      : payoutStatuses.includes("PENDING")
        ? "PENDING"
        : payoutStatuses[0] ?? "UNPAID";
    vendorOrderReconciliations.push({
      vendorOrderId: vendorOrder.id,
      orderNumber: vendorOrder.order.orderNumber,
      vendorName: vendorOrder.vendor.vendorProfile?.storeName ?? vendorOrder.vendor.displayName ?? vendorOrder.vendor.email,
      currency: vendorOrder.order.currency,
      appliedRates,
      expectedCommission: expectedCommission?.abs().toFixed(2) ?? null,
      actualCommission: actualBaseCommission.abs().toFixed(2),
      expectedVendorEarnings: expectedEarnings?.toFixed(2) ?? null,
      actualVendorEarnings: actualEarnings.toFixed(2),
      difference: expectedEarnings?.sub(actualEarnings).toFixed(2) ?? null,
      payoutStatus,
      issue: result.issues.join("; ") || "Matched",
    });
    if (result.issues.length > 0 || (differences && Object.values(differences).some((amount) => !amount.isZero()))) {
      const expectedAmount = result.expectedSales
        .add(result.expectedCommission)
        .add(result.expectedDiscount)
        .add(result.expectedDelivery);
      const actualAmount = result.actualSales
        .add(result.actualCommission)
        .add(result.actualDiscount)
        .add(result.actualDelivery);
      discrepancies.push({
        vendorOrderId: vendorOrder.id,
        orderNumber: vendorOrder.order.orderNumber,
        vendorId: vendorOrder.vendor.id,
        vendorName: vendorOrder.vendor.vendorProfile?.storeName ?? vendorOrder.vendor.displayName ?? vendorOrder.vendor.email,
        currency: vendorOrder.order.currency,
        status: vendorOrder.status,
        paymentStatus: vendorOrder.order.paymentStatus,
        expectedAmount: money(expectedAmount),
        actualAmount: money(actualAmount),
        difference: money(expectedAmount.sub(actualAmount)),
        details: differences
          ? {
            expectedSales: money(result.expectedSales),
            actualSales: money(result.actualSales),
            salesDifference: money(differences.sales),
            expectedCommission: money(result.expectedCommission),
            actualCommission: money(result.actualCommission),
            commissionDifference: money(differences.commission),
            expectedVendorDiscount: money(result.expectedDiscount),
            actualVendorDiscount: money(result.actualDiscount),
            vendorDiscountDifference: money(differences.vendorDiscount),
            expectedDeliveryFee: money(result.expectedDelivery),
            actualDeliveryFee: money(result.actualDelivery),
            deliveryFeeDifference: money(differences.deliveryFee),
          }
          : {},
        issue: result.issues.join("; ") || "Order totals and ledger entries do not match",
      });
    }
  }

  const couponDiscrepancies = platformOrders.flatMap((order) => {
    const expected = new Prisma.Decimal(order.platformDiscount);
    const redeemed = sumLedgerAmounts(order.redemptions);
    const ledgerEntries = order.ledgerEntries;
    const recorded = sumLedgerAmounts(ledgerEntries).neg();
    const currencyMismatch = ledgerEntries.some((entry) => entry.currency !== order.currency);
    if (expected.eq(redeemed) && expected.eq(recorded) && !currencyMismatch) return [];
    return [{
      orderId: order.id,
      orderNumber: order.orderNumber,
      couponCodes: [...new Set(order.redemptions.map((redemption) => redemption.coupon.code))],
      currency: order.currency,
      expectedAmount: money(expected),
      redeemedAmount: money(redeemed),
      ledgerAmount: money(recorded),
      issue: currencyMismatch
        ? "Platform coupon ledger currency does not match the order"
        : "Platform coupon allocation, redemption, and ledger amounts do not match",
    }];
  });

  const paymentDiscrepancies = platformOrders.flatMap((order) => {
    const payment = order.payment;
    const issues = [
      ...(!payment ? ["Captured payment record is missing"] : []),
      ...(payment && payment.status !== "SUCCEEDED" ? ["Payment record is not marked successful"] : []),
      ...(payment && !payment.amount.eq(order.totalAmount) ? ["Order total and captured payment do not match"] : []),
      ...(payment && !payment.simulated ? ["Payment record is not marked simulated"] : []),
    ];
    if (issues.length === 0) return [];
    return [{
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      expectedAmount: money(order.totalAmount),
      actualAmount: payment ? money(payment.amount) : "0.00",
      issue: issues.join("; "),
    }];
  });

  const payoutDiscrepancies = payouts.flatMap((payout) => {
    const reservedEntries = [
      ...payout.entries.filter((entry) => entry.type !== "PAYOUT"),
      ...payout.allocations.map((allocation) => allocation.ledgerEntry),
    ];
    const payoutEntries = payout.entries.filter((entry) => entry.type === "PAYOUT");
    const reservedAmount = sumLedgerAmounts(reservedEntries);
    const recordedPayout = sumLedgerAmounts(payoutEntries);
    const currencyMismatch = [...reservedEntries, ...payoutEntries].some((entry) =>
      entry.currency !== payout.currency || (entry.vendorId !== null && entry.vendorId !== payout.vendorId),
    );
    const issues: string[] = [];

    if (currencyMismatch) issues.push("Payout entries do not match the payout vendor or currency");
    if (payout.status === "SIMULATED_PAID" &&
      (payoutEntries.length !== 1 || !recordedPayout.eq(payout.amount.neg()) || !reservedAmount.eq(payout.amount))) {
      issues.push("Completed payout does not match its reserved balance and payout ledger entry");
    }
    if (payout.status === "PENDING" &&
      (payoutEntries.length > 0 || !reservedAmount.eq(payout.amount))) {
      issues.push("Pending payout reservation does not match its payout amount");
    }
    if (payout.status === "CANCELLED" && (payout.entries.length > 0 || payout.allocations.length > 0)) {
      issues.push("Cancelled payout still has financial entries assigned");
    }
    if (payout.status === "FAILED") {
      issues.push(payout.failureReason
        ? `Failed payout requires review: ${payout.failureReason}`
        : "Failed payout requires review and reservation reconciliation");
    }
    if (payout.status === "APPROVED" || payout.status === "PROCESSING") {
      issues.push(`Payout remains unresolved in ${payout.status} state`);
    }
    if (issues.length === 0) return [];
    return [{
      payoutId: payout.id,
      reference: payout.reference,
      vendorId: payout.vendorId,
      status: payout.status,
      currency: payout.currency,
      expectedAmount: money(payout.amount),
      reservedAmount: money(reservedAmount),
      recordedPayout: money(recordedPayout.neg()),
      issue: issues.join("; "),
    }];
  });

  const batches = await listAdminPayoutBatches();
  return {
    checkedVendorOrders: vendorOrders.length,
    discrepancyCount: discrepancies.length + couponDiscrepancies.length + paymentDiscrepancies.length + payoutDiscrepancies.length,
    vendorOrderReconciliations,
    discrepancies: discrepancies.slice(0, 200),
    couponDiscrepancies: couponDiscrepancies.slice(0, 200),
    paymentDiscrepancies: paymentDiscrepancies.slice(0, 200),
    payoutDiscrepancies: payoutDiscrepancies.slice(0, 200),
    payoutBatches: batches.batches,
    checkedAt: new Date().toISOString(),
    simulated: true,
  };
}
