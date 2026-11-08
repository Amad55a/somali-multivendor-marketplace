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
    returnDisputeUpdate: methods(),
    customerNotification: methods(),
    vendorNotification: methods(),
    adminNotification: methods(),
    auditLog: methods(),
    simulatedRefund: methods(),
    ledgerEntry: methods(),
    paymentRecord: methods(),
    marketplaceOrder: methods(),
    categoryCommission: methods(),
    productVariant: methods(),
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
  returnDisputeUpdate: database.returnDisputeUpdate,
  customerNotification: database.customerNotification,
  vendorNotification: database.vendorNotification,
  adminNotification: database.adminNotification,
  auditLog: database.auditLog,
  simulatedRefund: database.simulatedRefund,
  ledgerEntry: database.ledgerEntry,
  paymentRecord: database.paymentRecord,
  marketplaceOrder: database.marketplaceOrder,
  categoryCommission: database.categoryCommission,
  productVariant: database.productVariant,
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

function returnRecord(status: string, quantity = 1, id = "return-1", paymentAmount = 170) {
  const orderLine = {
    id: "line-1",
    variantId: "variant-1",
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
          amount: new Prisma.Decimal(paymentAmount),
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
    id,
    orderId: "order-1",
    orderLineId: "line-1",
    customerId: customer.id,
    vendorId: vendor.id,
    quantity,
    status,
    vendorNote: ["VENDOR_REJECTED", "ESCALATED", "IN_REVIEW"].includes(status) ? "The product was used or damaged." : null,
    disputeResolution: null,
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

    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    await expect(reviewReturn(vendor, "return-1", "APPROVE", undefined, "Ship to the store"))
      .resolves.toMatchObject({ status: "VENDOR_APPROVED" });

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REQUESTED") as never);
    await expect(reviewReturn(vendor, "return-1", "REJECT", "The item was used"))
      .resolves.toMatchObject({ status: "VENDOR_REJECTED" });

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("VENDOR_REJECTED") as never);
    await expect(reviewReturn(customer, "return-1", "ESCALATE"))
      .resolves.toMatchObject({ status: "ESCALATED" });
    expect(database.adminNotification.create).toHaveBeenCalledOnce();

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("ESCALATED") as never);
    await expect(reviewReturn(admin, "return-1", "ADMIN_REJECT", "Evidence did not match"))
      .resolves.toMatchObject({ status: "ADMIN_REJECTED" });
    expect(database.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: admin.id,
        action: "ADMIN_UPHOLD",
        metadata: expect.objectContaining({ reason: "Evidence did not match" }),
      }),
    }));
  });

  it("moves an escalated appeal to review and prevents duplicate transitions", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("ESCALATED") as never);
    database.returnRequest.updateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);

    await expect(reviewReturn(admin, "return-1", "ADMIN_START_REVIEW", "We are reviewing the evidence."))
      .resolves.toMatchObject({
        status: "IN_REVIEW",
        vendorNote: "The product was used or damaged.",
        adminNote: "We are reviewing the evidence.",
      });
    expect(database.returnRequest.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "return-1", status: "ESCALATED" },
      data: expect.objectContaining({ status: "IN_REVIEW" }),
    }));
    expect(database.customerNotification.create).toHaveBeenCalledOnce();
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
    expect(database.auditLog.create).toHaveBeenCalledOnce();
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: "REVIEW_STARTED", audience: "BOTH" }),
    }));

    await expect(reviewReturn(admin, "return-1", "ADMIN_START_REVIEW", "Duplicate"))
      .rejects.toMatchObject({ code: "RETURN_CONCURRENT_CHANGE" });
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledOnce();
  });

  it("overturns a vendor rejection by authorizing shipment only, without refund or restock", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("IN_REVIEW") as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    await expect(reviewReturn(admin, "return-1", "ADMIN_OVERTURN", "The evidence supports the customer.", "Ship the item to the vendor."))
      .resolves.toMatchObject({
        status: "ADMIN_APPROVED",
        disputeResolution: "RESOLVED_CUSTOMER_FAVORED",
        returnInstructions: "Ship the item to the vendor.",
        vendorNote: "The product was used or damaged.",
      });
    expect(database.returnRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "return-1", status: "IN_REVIEW" },
      data: expect.objectContaining({ status: "ADMIN_APPROVED", disputeResolution: "RESOLVED_CUSTOMER_FAVORED" }),
    }));
    expect(database.customerNotification.create).toHaveBeenCalledOnce();
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
    expect(database.simulatedRefund.create).not.toHaveBeenCalled();
    expect(database.productVariant.update).not.toHaveBeenCalled();
    expect(database.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("upholds the vendor decision with a saved admin explanation and closes the dispute", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("ESCALATED") as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    await expect(reviewReturn(admin, "return-1", "ADMIN_UPHOLD", "The vendor's inspection was supported by evidence."))
      .resolves.toMatchObject({
        status: "ADMIN_REJECTED",
        disputeResolution: "RESOLVED_VENDOR_UPHELD",
        adminNote: "The vendor's inspection was supported by evidence.",
      });
    expect(database.customerNotification.create).toHaveBeenCalledOnce();
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: "VENDOR_DECISION_UPHELD", content: "The vendor's inspection was supported by evidence." }),
    }));
    expect(database.simulatedRefund.create).not.toHaveBeenCalled();
    expect(database.productVariant.update).not.toHaveBeenCalled();
  });

  it("records targeted information requests and participant replies without closing the dispute", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("ESCALATED") as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    await expect(reviewReturn(admin, "return-1", "ADMIN_REQUEST_INFO", "Please upload photos of the packaging.", undefined, "CUSTOMER"))
      .resolves.toMatchObject({ status: "IN_REVIEW", disputeResolution: "INFORMATION_REQUESTED" });
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ audience: "CUSTOMER", requestedFrom: "CUSTOMER", kind: "INFORMATION_REQUESTED" }),
    }));
    expect(database.customerNotification.create).toHaveBeenCalledOnce();
    expect(database.vendorNotification.create).not.toHaveBeenCalled();

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("IN_REVIEW") as never);
    await expect(reviewReturn(customer, "return-1", "DISPUTE_MESSAGE", "I uploaded another photo."))
      .resolves.toMatchObject({ status: "IN_REVIEW" });
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authorRole: "CUSTOMER", audience: "BOTH", kind: "MESSAGE" }),
    }));
    expect(database.adminNotification.create).toHaveBeenCalledOnce();
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
  });

  it("does not expose vendor-only evidence requests as customer decision notes", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("IN_REVIEW") as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    await reviewReturn(admin, "return-1", "ADMIN_REQUEST_INFO", "Please provide the supplier invoice.", undefined, "VENDOR");

    expect(database.returnRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adminNote: undefined }),
    }));
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ audience: "VENDOR", requestedFrom: "VENDOR" }),
    }));
    expect(database.customerNotification.create).not.toHaveBeenCalled();
    expect(database.vendorNotification.create).toHaveBeenCalledOnce();
  });

  it("rejects duplicate final decisions after the state has advanced", async () => {
    runTransaction();
    database.returnRequest.findUnique
      .mockResolvedValueOnce(returnRecord("ESCALATED") as never)
      .mockResolvedValueOnce(returnRecord("ADMIN_REJECTED") as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    await reviewReturn(admin, "return-1", "ADMIN_UPHOLD", "Decision explanation.");
    await expect(reviewReturn(admin, "return-1", "ADMIN_UPHOLD", "Duplicate decision."))
      .rejects.toMatchObject({ code: "INVALID_RETURN_STATE" });
    expect(database.returnRequest.updateMany).toHaveBeenCalledOnce();
    expect(database.returnDisputeUpdate.create).toHaveBeenCalledOnce();
    expect(database.simulatedRefund.create).not.toHaveBeenCalled();
    expect(database.productVariant.update).not.toHaveBeenCalled();
  });

  it("refunds only after receipt, records a partial simulated refund, and reverses the owning vendor's ledger", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("RETURN_SHIPPED") as never);
    database.simulatedRefund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } } as never);
    database.categoryCommission.findUnique.mockResolvedValue({ percent: new Prisma.Decimal(10) } as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);
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
    expect(database.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "return-1", status: "RETURN_SHIPPED" },
      data: expect.objectContaining({ status: "REFUND_PROCESSING" }),
    });
    expect(database.productVariant.update).toHaveBeenCalledWith({
      where: { id: "variant-1" },
      data: { stockQuantity: { increment: 1 } },
    });
    expect(database.paymentRecord.update).not.toHaveBeenCalled();

    database.returnRequest.findUnique.mockResolvedValue(returnRecord("REFUNDED") as never);
    await expect(reviewReturn(vendor, "return-1", "RECEIVE"))
      .rejects.toMatchObject({ code: "INVALID_RETURN_STATE" });
    expect(database.simulatedRefund.create).toHaveBeenCalledOnce();
  });

  it("does not restock or refund when the conditional receipt transition loses a race", async () => {
    runTransaction();
    database.returnRequest.findUnique.mockResolvedValue(returnRecord("RETURN_SHIPPED") as never);
    database.simulatedRefund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } } as never);
    database.returnRequest.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(reviewReturn(vendor, "return-1", "RECEIVE"))
      .rejects.toMatchObject({ code: "RETURN_CONCURRENT_CHANGE" });
    expect(database.productVariant.update).not.toHaveBeenCalled();
    expect(database.simulatedRefund.create).not.toHaveBeenCalled();
    expect(database.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("refunds and restocks sequential partial returns without exceeding the captured amount", async () => {
    runTransaction();
    let refunded = new Prisma.Decimal(0);
    database.returnRequest.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(returnRecord("RETURN_SHIPPED", 1, where.id, 220)) as never,
    );
    database.returnRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    database.returnRequest.update.mockResolvedValue({ status: "REFUNDED" } as never);
    database.simulatedRefund.aggregate.mockImplementation(async () => ({ _sum: { amount: refunded } }) as never);
    database.simulatedRefund.create.mockImplementation(({ data }: { data: { amount: Prisma.Decimal } }) => {
      refunded = refunded.add(data.amount);
      return Promise.resolve({}) as never;
    });

    await reviewReturn(vendor, "return-1", "RECEIVE");
    await reviewReturn(vendor, "return-2", "RECEIVE");

    expect(refunded.toFixed(2)).toBe("174.00");
    expect(database.simulatedRefund.create).toHaveBeenCalledTimes(2);
    expect(database.productVariant.update).toHaveBeenNthCalledWith(1, {
      where: { id: "variant-1" },
      data: { stockQuantity: { increment: 1 } },
    });
    expect(database.productVariant.update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant-1" },
      data: { stockQuantity: { increment: 1 } },
    });
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
