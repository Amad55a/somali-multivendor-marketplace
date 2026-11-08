import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

type StockItem = { id: string; stockQuantity: number };
type StockOptions = { exceptCustomerId?: string };

/**
 * Sweeps and transitions expired 10-minute stock reservations to 'EXPIRED' status.
 *
 * Side effects:
 * - Updates all `stock_reservations` records where status = 'ACTIVE' and expiresAt <= NOW().
 * - Re-enables locked quantities to be purchased by other customers.
 *
 * Invoked by the minute cron runner (`/api/cron/marketplace`), checkout reservation
 * attempts, and manual administrative maintenance jobs.
 */
export async function expireReservations() {
  await prisma.stockReservation.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

/**
 * Calculates current purchasable stock for multiple product variants by subtracting
 * active unexpired stock reservations from physical inventory.
 *
 * @param variants Array of variant items with their physical stockQuantity.
 * @param options Optional filter to exclude a specific customer's active reservations.
 * @returns Map of variant ID to net available stock count (never below 0).
 */
export async function availableStockForVariants(
  variants: StockItem[],
  options: StockOptions = {},
) {
  const now = new Date();
  if (variants.length === 0) return new Map<string, number>();
  await expireReservations();
  const reserved = await prisma.stockReservationItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variants.map(({ id }) => id) },
      reservation: {
        status: "ACTIVE",
        expiresAt: { gt: now },
        ...(options.exceptCustomerId
          ? { customerId: { not: options.exceptCustomerId } }
          : {}),
      },
    },
    _sum: { quantity: true },
  });
  const reservedByVariant = new Map(
    reserved.map((row) => [row.variantId, row._sum.quantity ?? 0]),
  );
  return new Map(
    variants.map(({ id, stockQuantity }) => [
      id,
      Math.max(0, stockQuantity - (reservedByVariant.get(id) ?? 0)),
    ]),
  );
}

export async function availableStock(
  variantId: string,
  physicalStock: number,
  options: StockOptions = {},
) {
  const stock = await availableStockForVariants(
    [{ id: variantId, stockQuantity: physicalStock }],
    options,
  );
  return stock.get(variantId) ?? 0;
}

/**
 * Transaction-safe check of variant stock availability during an active database transaction.
 *
 * @param tx Interactive Prisma transaction client.
 * @param variantId Variant UUID being checked.
 * @param physicalStock Current variant physical stock from database.
 * @param options Options to exclude the current reservation ID or customer ID.
 * @returns Available stock quantity (0 or positive integer).
 */
export async function availableStockInTransaction(
  tx: Prisma.TransactionClient,
  variantId: string,
  physicalStock: number,
  options: { exceptReservationId?: string; exceptCustomerId?: string } = {},
) {
  const held = await tx.stockReservationItem.aggregate({
    where: {
      variantId,
      reservation: {
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        ...(options.exceptReservationId
          ? { id: { not: options.exceptReservationId } }
          : {}),
        ...(options.exceptCustomerId
          ? { customerId: { not: options.exceptCustomerId } }
          : {}),
      },
    },
    _sum: { quantity: true },
  });
  return Math.max(0, physicalStock - (held._sum.quantity ?? 0));
}

/**
 * Acquires pessimistic row-level locks on product variants using PostgreSQL `SELECT ... FOR UPDATE`.
 * Variant IDs are deduplicated and sorted lexicographically to eliminate deadlock risks
 * during high-concurrency checkout operations.
 *
 * @param tx Interactive Prisma transaction client.
 * @param variantIds List of variant UUIDs to lock.
 */
export async function lockInventoryVariants(
  tx: Prisma.TransactionClient,
  variantIds: string[],
) {
  for (const id of [...new Set(variantIds)].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "product_variants" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }
}
