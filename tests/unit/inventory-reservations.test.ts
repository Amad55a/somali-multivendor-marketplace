import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stockReservation: { updateMany: vi.fn() },
    stockReservationItem: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  availableStockForVariants,
  availableStockInTransaction,
  lockInventoryVariants,
} from "@/features/commerce/inventory";

beforeEach(() => vi.clearAllMocks());

describe("inventory reservations", () => {
  it("subtracts active holds from physical stock and can exclude a customer's own holds", async () => {
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.stockReservationItem.groupBy).mockResolvedValue([
      { variantId: "variant-a", _sum: { quantity: 3 } },
    ] as never);

    const stock = await availableStockForVariants(
      [{ id: "variant-a", stockQuantity: 5 }],
      { exceptCustomerId: "customer-a" },
    );

    expect(stock.get("variant-a")).toBe(2);
    expect(prisma.stockReservationItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservation: expect.objectContaining({
            customerId: { not: "customer-a" },
          }),
        }),
      }),
    );
  });

  it("checks transaction availability while excluding the current reservation", async () => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { quantity: 4 } });
    const tx = { stockReservationItem: { aggregate } } as never;

    await expect(
      availableStockInTransaction(tx, "variant-a", 5, { exceptReservationId: "reservation-a" }),
    ).resolves.toBe(1);
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservation: expect.objectContaining({
            id: { not: "reservation-a" },
            status: "ACTIVE",
          }),
        }),
      }),
    );
  });

  it("locks each distinct variant in deterministic order", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    await lockInventoryVariants({ $queryRaw: queryRaw } as never, ["variant-b", "variant-a", "variant-b"]);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual(["variant-a", "variant-b"]);
  });
});
