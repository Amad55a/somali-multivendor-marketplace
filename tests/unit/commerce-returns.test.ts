import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const methods = () => ({
    aggregate: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    $transaction: vi.fn(),
    orderLine: methods(),
    productReview: methods(),
    returnRequest: methods(),
    customerNotification: methods(),
    vendorNotification: methods(),
    adminNotification: methods(),
    auditLog: methods(),
    simulatedRefund: methods(),
    ledgerEntry: methods(),
    paymentRecord: methods(),
    marketplaceOrder: methods(),
    categoryCommission: methods(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));

import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import {
  createReview,
  listVendorReturns,
  requestReturn,
  reviewReturn,
} from "@/features/commerce/marketplace-workflow";
import { prisma } from "@/lib/prisma";

const customer: AuthenticatedUser = {
  id: "customer-1",
  email: "customer@example.test",
  accountType: "CUSTOMER",
  emailVerifiedAt: new Date(),
  hasAmazonIdentity: false,
  sessionId: "session-customer",
};
const vendor: AuthenticatedUser = {
  ...customer,
  id: "vendor-1",
  email: "vendor@example.test",
  accountType: "VENDOR",
  sessionId: "session-vendor",
};
const admin: AuthenticatedUser = {
  ...customer,
  id: "admin-1",
  email: "admin@example.test",
  accountType: "ADMIN",
  sessionId: "session-admin",
};

const tx = {
  orderLine: database.orderLine,
  productReview: database.productReview,
  returnRequest: database.returnRequest,
  customerNotification: database.customerNotification,
  vendorNotification: database.vendorNotification,
  adminNotification: database.adminNotification,
  auditLog: database.auditLog,
  simulatedRefund: database.simulatedRefund,
  ledgerEntry: database.ledgerEntry,
  paymentRecord: database.paymentRecord,
  marketplaceOrder: database.marketplaceOrder,
  categoryCommission: database.categoryCommission,
};

function runTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(((
    callback: (client: unknown) => Promise<unknown>,
  ) => callback(tx)) as never);
}

function eligibleLine(deliveredAt = new Date()) {
  return {
    id: "line-1",
    quantity: 3,
    vendorOrderId: "vendor-order-1",
    vendorOrder: {
      orderId: "order-1",
      vendorId: vendor.id,
      deliveredAt,
      order: { orderNumber: "SQ-1" },
    },
  };
}

function returnRecord(status: string) {
  const orderLine = {
    id: "line-1",
    unitPrice: new Prisma.Decimal(100),
    quantity: 2,
    categoryId: "category-1",
    vendorOrderId: "vendor-order-1",
    commissionPercent: new Prisma.Decimal(10),
    commissionAmount: new Prisma.Decimal(20),
    vendorOrder: {
      id: "vendor-order-1",
      vendorId: vendor.id,
      discountAmount: new Prisma.Decimal(10),
      lines: [{ unitPrice: new Prisma.Decimal(100), quantity: 2 }],
      order: {
        orderNumber: "SQ-1",
        platformDiscount: new Prisma.Decimal(20),
        payment: {
          id: "payment-1",
          amount: new Prisma.Decimal(170),
          simulated: true,
          status: "SUCCEEDED",
        },
        vendorOrders: [
          { lines: [{ unitPrice: new Prisma.Decimal(100), quantity: 2 }] },
          { lines: [{ unitPrice: new Prisma.Decimal(50), quantity: 1 }] },
        ],
      },
    },
  };
  return {
    id: "return-1",
    orderId: "order-1",
    orderLineId: "line-1",
    customerId: customer.id,
    vendorId: vendor.id,
    quantity: 1,
    status,
    orderLine,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("customer order-item reviews", () => {
  it("creates a review only for the customer's delivered product line", async () => {
    runTransaction();
    database.orderLine.findFirst.mockResolvedValue(eligibleLine() as never);
    database.productReview.create.mockResolvedValue({ id: "review-1" } as never);

    await expect(createReview(customer, "product-1", "line-1", 5))
      .resolves.toMatchObject({ id: "review-1" });
    expect(database.orderLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "line-1",
        variant: { productId: "product-1" },
        vendorOrder: expect.objectContaining({
          order: { customerId: customer.id, paymentStatus: "SUCCEEDED" },
        }),
      }),
    }));
    expect(database.productReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { productId: "product-1", customerId: customer.id, orderLineId: "line-1", rating: 5 },
    }));
  });

  it("rejects an undelivered item and maps the database unique constraint to a duplicate conflict", async () => {
    runTransaction();
    database.orderLine.findFirst.mockResolvedValue(null);
    await expect(createReview(customer, "product-1", "line-1", 5))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });

    database.orderLine.findFirst.mockResolvedValue(eligibleLine() as never);
    database.productReview.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test", meta: { target: ["orderLineId"] } },
    ));
    await expect(createReview(customer, "product-1", "line-1", 5))
      .rejects.toMatchObject({ code: "REVIEW_EXISTS" });
  });
});

describe("quantity-aware return requests", () => {
  it("accepts a partial return within seven calendar days and records notifications", async () => {
    runTransaction();
    database.orderLine.findFirst.mockResolvedValue(eligibleLine() as never);
    database.returnRequest.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as never);
    database.returnRequest.count.mockResolvedValue(0);
    database.returnRequest.create.mockResolvedValue({ id: "return-1", quantity: 1 } as never);

    await expect(requestReturn(customer, "line-1", "DAMAGED_PRODUCT", "", 1))
      .resolves.toMatchObject({ id: "return-1" });
    expect(database.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 1, customerId: customer.id, vendorId: vendor.id }),
    }));
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
    expect(database.customerNotification.create).toHaveBeenCalledOnce();
  });

  it("rejects returns after seven days and quantities exceeding the unreturned balance", async () => {
    runTransaction();
    database.orderLine.findFirst.mockResolvedValue(
      eligibleLine(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)) as never,
    );
    await expect(requestReturn(customer, "line-1", "DAMAGED_PRODUCT", "", 1))
      .rejects.toMatchObject({ code: "RETURN_WINDOW_CLOSED" });

    database.orderLine.findFirst.mockResolvedValue(eligibleLine() as never);
    database.returnRequest.aggregate.mockResolvedValue({ _sum: { quantity: 2 } } as never);
    await expect(requestReturn(customer, "line-1", "DAMAGED_PRODUCT", "", 2))
      .rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED" });
    expect(database.returnRequest.create).not.toHaveBeenCalled();
  });

  it("prevents a customer from requesting returns for another customer's item", async () => {
    runTransaction();
    database.orderLine.findFirst.mockResolvedValue(null);
    await expect(requestReturn(customer, "someone-elses-line", "OTHER", "", 1))
      .rejects.toMatchObject({ code: "RETURN_NOT_ELIGIBLE" });
  });
});

describe("vendor and admin return workflow", () => {
  it("scopes vendor return listings and rejects a different vendor's decision", async () => {
    database.returnRequest.findMany.mockResolvedValue([] as never);
    await listVendorReturns(vendor);
    expect(database.returnRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { vendorId: vendor.id },
    }));

    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REQUESTED") as never);
    await expect(reviewReturn({ ...vendor, id: "other-vendor" }, "return-1", "APPROVE"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(database.returnRequest.update).not.toHaveBeenCalled();
  });

  it("requires a reason to reject, approves a vendor return, and audits admin dispute decisions", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REQUESTED") as never);
    await expect(reviewReturn(vendor, "return-1", "REJECT"))
      .rejects.toMatchObject({ code: "RETURN_DECISION_REASON_REQUIRED" });

    database.returnRequest.update.mockResolvedValue({ status: "VENDOR_APPROVED" } as never);
    await expect(reviewReturn(vendor, "return-1", "APPROVE", undefined, "Ship to the store"))
      .resolves.toMatchObject({ status: "VENDOR_APPROVED" });

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REQUESTED") as never);
    database.returnRequest.update.mockResolvedValue({ status: "VENDOR_REJECTED" } as never);
    await expect(reviewReturn(vendor, "return-1", "REJECT", "The item was used"))
      .resolves.toMatchObject({ status: "VENDOR_REJECTED" });

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("VENDOR_REJECTED") as never);
    database.returnRequest.update.mockResolvedValue({ status: "ESCALATED" } as never);
    await expect(reviewReturn(customer, "return-1", "ESCALATE"))
      .resolves.toMatchObject({ status: "ESCALATED" });
    expect(database.adminNotification.create).toHaveBeenCalledOnce();

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("ESCALATED") as never);
    database.returnRequest.update.mockResolvedValue({ status: "ADMIN_REJECTED" } as never);
    await expect(reviewReturn(admin, "return-1", "ADMIN_REJECT", "Evidence did not match"))
      .resolves.toMatchObject({ status: "ADMIN_REJECTED" });
    expect(database.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: admin.id,
        action: "ADMIN_REJECTED",
        metadata: expect.objectContaining({ reason: "Evidence did not match" }),
      }),
    }));
  });

  it("refunds only after receipt, records a partial simulated refund, and reverses the owning vendor's ledger", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("RETURN_SHIPPED") as never);
    database.simulatedRefund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } } as never);
    database.categoryCommission.findUnique.mockResolvedValue({ percent: new Prisma.Decimal(10) } as never);
    database.returnRequest.update.mockResolvedValue({ status: "REFUNDED" } as never);

    await expect(reviewReturn(vendor, "return-1", "RECEIVE"))
      .resolves.toMatchObject({ status: "REFUNDED" });
    expect(database.simulatedRefund.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(87),
        vendorOrderId: "vendor-order-1",
        returnId: "return-1",
        simulated: true,
      }),
    }));
    expect(database.ledgerEntry.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ vendorId: vendor.id, amount: new Prisma.Decimal(-95), type: "REFUND" }),
        expect.objectContaining({ vendorId: vendor.id, amount: new Prisma.Decimal(10), type: "COMMISSION" }),
      ]),
      skipDuplicates: true,
    }));
    expect(database.paymentRecord.update).not.toHaveBeenCalled();

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REFUNDED") as never);
    await expect(reviewReturn(vendor, "return-1", "RECEIVE"))
      .rejects.toMatchObject({ code: "INVALID_RETURN_STATE" });
    expect(database.simulatedRefund.create).toHaveBeenCalledOnce();
  });

  it("rejects a receipt refund that would exceed the remaining captured payment", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("RETURN_SHIPPED") as never);
    database.simulatedRefund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(100) } } as never);

    await expect(reviewReturn(vendor, "return-1", "RECEIVE"))
      .rejects.toMatchObject({ code: "REFUND_EXCEEDS_CAPTURED_PAYMENT" });
    expect(database.simulatedRefund.create).not.toHaveBeenCalled();
    expect(database.ledgerEntry.createMany).not.toHaveBeenCalled();
  });
});
