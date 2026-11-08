import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({
  getAuthConfig: vi.fn(() => ({ appUrl: "https://somsuuq.test" })),
}));
vi.mock("@/features/auth/email", () => ({
  sendSupportEmailMessage: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportTicket: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    supportMessage: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    supportTicketActivity: { create: vi.fn() },
    supportEmailDelivery: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUniqueOrThrow: vi.fn() },
    supportAttachment: { findUnique: vi.fn() },
    customerNotification: { create: vi.fn(), updateMany: vi.fn() },
    vendorNotification: { create: vi.fn(), updateMany: vi.fn() },
    adminNotification: { create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  createSupportTicket,
  getSupportAttachment,
  getSupportTicket,
  retrySupportEmailDelivery,
  updateAdminSupportTicket,
} from "@/features/support/service";
import {
  adminReplyStatus,
  requesterReplyStatus,
  supportMessageNotificationKey,
  supportTicketCreatedNotificationKey,
} from "@/features/support/workflow";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { sendSupportEmailMessage } from "@/features/auth/email";

const requester = {
  id: "807c363a-20a5-4db4-bf03-7ae5bf51a9d2",
  accountType: "CUSTOMER" as const,
};
const ticketId = "f9f8b122-b149-4ffc-9d6d-27e1067c89fb";
const deliveryId = "597d408f-6fc0-4bdb-a6f3-6cd8d7e74e4a";

beforeEach(() => {
  vi.clearAllMocks();
});

function configureTransactionalDelivery(
  requesterRole: "CUSTOMER" | "VENDOR" = "CUSTOMER",
  locale: "en" | "so" = "so",
) {
  const committed = { value: false };
  vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (operation) => {
    if (typeof operation !== "function") {
      throw new Error("Expected an interactive transaction.");
    }
    const result = await operation(prisma as never);
    committed.value = true;
    return result;
  });
  vi.mocked(prisma.supportTicket.create).mockResolvedValue({
    id: ticketId,
    reference: "SSQ-261107-ABC123",
    status: "OPEN",
  } as never);
  vi.mocked(prisma.supportMessage.create).mockResolvedValue({
    id: "initial-message",
  } as never);
  vi.mocked(prisma.supportTicketActivity.create).mockResolvedValue({
    id: "activity-id",
  } as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
    email: "registered@example.test",
  } as never);
  vi.mocked(prisma.supportEmailDelivery.create).mockResolvedValue({
    id: deliveryId,
  } as never);
  vi.mocked(prisma.supportEmailDelivery.findFirst).mockResolvedValue({
    id: deliveryId,
  } as never);
  vi.mocked(prisma.supportEmailDelivery.findUnique).mockResolvedValue({
    id: deliveryId,
    event: "TICKET_CREATED",
    status: "PENDING",
    recipientEmail: "registered@example.test",
    locale,
    ticketId,
    createdAt: new Date("2026-11-07T07:00:00.000Z"),
    ticket: {
      reference: "SSQ-261107-ABC123",
      subject: "Dalabkayga ayaa dib u dhacay",
      createdAt: new Date("2026-11-07T07:00:00.000Z"),
      requesterRole,
    },
  } as never);
  vi.mocked(prisma.supportEmailDelivery.updateMany).mockResolvedValue({
    count: 1,
  } as never);
  vi.mocked(prisma.supportEmailDelivery.update).mockResolvedValue({} as never);
  return committed;
}

describe("support ticket access", () => {
  it("scopes requester lookup by both ticket ID and requester identity", async () => {
    vi.mocked(prisma.supportTicket.findFirst).mockResolvedValue(null as never);

    await expect(getSupportTicket(requester, ticketId)).rejects.toMatchObject({
      code: "SUPPORT_TICKET_NOT_FOUND",
      status: 404,
    });
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: {
        id: ticketId,
        requesterId: requester.id,
        requesterRole: "CUSTOMER",
      },
    });
    expect(prisma.supportTicket.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("excludes internal notes from requester ticket details", async () => {
    vi.mocked(prisma.supportTicket.findFirst).mockResolvedValue({
      id: ticketId,
    } as never);
    vi.mocked(prisma.supportMessage.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.customerNotification.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(prisma.supportTicket.findUniqueOrThrow).mockResolvedValue({
      id: ticketId,
    } as never);

    await getSupportTicket(requester, ticketId);

    const query = vi.mocked(prisma.supportTicket.findUniqueOrThrow).mock.calls[0]?.[0];
    expect(query?.include?.messages).toMatchObject({
      where: { internalNote: false },
    });
    expect(query?.include?.emailDeliveries).toBeUndefined();
  });

  it("hides another requester's internal-note attachments", async () => {
    vi.mocked(prisma.supportAttachment.findUnique).mockResolvedValue({
      id: "attachment-id",
      message: {
        internalNote: true,
        ticket: {
          requesterId: "another-user",
          requesterRole: "CUSTOMER",
        },
      },
    } as never);

    await expect(
      getSupportAttachment(requester, "attachment-id"),
    ).rejects.toMatchObject({
      code: "SUPPORT_ATTACHMENT_NOT_FOUND",
      status: 404,
    });
  });

  it("returns an existing ticket on an idempotent retry without creating another notification", async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({
      id: ticketId,
      reference: "SSQ-261107-ABC123",
      status: "OPEN",
    } as never);
    vi.mocked(prisma.supportMessage.findFirst).mockResolvedValue({
      id: "initial-message",
    } as never);

    const result = await createSupportTicket(requester, {
      subject: "Order needs support",
      description: "I need help with my marketplace order.",
      category: "ORDERS",
      idempotencyKey: "create-ticket-request-001",
    });

    expect(result).toMatchObject({
      id: ticketId,
      messageId: "initial-message",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.adminNotification.create).not.toHaveBeenCalled();
    expect(sendSupportEmailMessage).not.toHaveBeenCalled();
  });

  it("commits an email outbox record before sending to the registered address", async () => {
    const committed = configureTransactionalDelivery();
    vi.mocked(sendSupportEmailMessage).mockImplementation(async (message) => {
      expect(committed.value).toBe(true);
      expect(message.to).toBe("registered@example.test");
    });

    const result = await createSupportTicket(requester, {
      subject: "Dalabkayga ayaa dib u dhacay",
      description: "Waxaan u baahanahay caawimo ku saabsan dalabkayga.",
      category: "ORDERS",
      idempotencyKey: "create-ticket-request-002",
      locale: "so",
    });

    expect(result.id).toBe(ticketId);
    expect(prisma.supportEmailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId,
          activityId: "activity-id",
          event: "TICKET_CREATED",
          recipientEmail: "registered@example.test",
          locale: "so",
        }),
      }),
    );
    expect(sendSupportEmailMessage).toHaveBeenCalledOnce();
    expect(prisma.supportEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
  });

  it("keeps a created ticket when email delivery fails and stores only a safe error code", async () => {
    configureTransactionalDelivery();
    vi.mocked(sendSupportEmailMessage).mockRejectedValue(
      new AppError("EMAIL_DELIVERY_UNAVAILABLE", 503, "Delivery failed."),
    );

    const result = await createSupportTicket(requester, {
      subject: "Order needs support",
      description: "I need help with my marketplace order.",
      category: "ORDERS",
      idempotencyKey: "create-ticket-request-003",
    });

    expect(result.id).toBe(ticketId);
    expect(prisma.supportEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastError: "EMAIL_DELIVERY_UNAVAILABLE",
        }),
      }),
    );
  });

  it("uses the vendor's registered email address and vendor ticket link", async () => {
    configureTransactionalDelivery("VENDOR", "en");
    vi.mocked(sendSupportEmailMessage).mockResolvedValue();

    await createSupportTicket(
      { id: requester.id, accountType: "VENDOR" },
      {
        subject: "My store needs support",
        description: "I need help with my vendor store profile.",
        category: "STORE_PROFILE",
        idempotencyKey: "create-vendor-ticket-001",
        locale: "en",
      },
    );

    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: requester.id } }),
    );
    expect(sendSupportEmailMessage).toHaveBeenCalledOnce();
    expect(sendSupportEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "registered@example.test",
        html: expect.stringContaining("/en/vendor/help/tickets/"),
      }),
    );
  });

  it("keeps the ticket successful and does not retry if SMTP accepted but sent-state persistence failed", async () => {
    configureTransactionalDelivery();
    vi.mocked(sendSupportEmailMessage).mockResolvedValue();
    vi.mocked(prisma.supportEmailDelivery.update).mockRejectedValue(
      new Error("database state write failed"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createSupportTicket(requester, {
      subject: "Order needs support",
      description: "I need help with my marketplace order.",
      category: "ORDERS",
      idempotencyKey: "create-ticket-request-004",
    });

    expect(result.id).toBe(ticketId);
    expect(sendSupportEmailMessage).toHaveBeenCalledOnce();
    expect(prisma.supportEmailDelivery.update).toHaveBeenCalledTimes(1);
    expect(prisma.supportEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
    expect(log).toHaveBeenCalledWith(
      "[support-email] Provider accepted email; delivery state is uncertain",
      expect.objectContaining({ event: "TICKET_CREATED" }),
    );
  });
});

describe("support resolution email transitions", () => {
  function configureTicketUpdate(status: "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
    const committed = { value: false };
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({
      id: ticketId,
      reference: "SSQ-261107-ABC123",
      requesterId: requester.id,
      requesterRole: "CUSTOMER",
      requesterLocale: "so",
      status,
      priority: "NORMAL",
      assignedToId: null,
      updatedAt: new Date("2026-11-07T07:00:00.000Z"),
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) => {
      if (typeof operation !== "function") {
        throw new Error("Expected an interactive transaction.");
      }
      const result = await operation(prisma as never);
      committed.value = true;
      return result;
    });
    vi.mocked(prisma.supportTicket.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.supportTicket.findUniqueOrThrow).mockResolvedValue({
      id: ticketId,
      reference: "SSQ-261107-ABC123",
      requesterId: requester.id,
      requesterRole: "CUSTOMER",
    } as never);
    vi.mocked(prisma.supportTicketActivity.create).mockResolvedValue({
      id: "resolved-activity-id",
    } as never);
    vi.mocked(prisma.customerNotification.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      email: "registered@example.test",
    } as never);
    vi.mocked(prisma.supportEmailDelivery.create).mockResolvedValue({
      id: deliveryId,
    } as never);
    vi.mocked(prisma.supportEmailDelivery.findUnique).mockResolvedValue({
      id: deliveryId,
      event: "TICKET_RESOLVED",
      status: "PENDING",
      recipientEmail: "registered@example.test",
      locale: "so",
      ticketId,
      createdAt: new Date("2026-11-07T07:00:00.000Z"),
      ticket: {
        reference: "SSQ-261107-ABC123",
        subject: "Dalabkayga ayaa dib u dhacay",
        createdAt: new Date("2026-11-07T07:00:00.000Z"),
        requesterRole: "CUSTOMER",
      },
    } as never);
    vi.mocked(prisma.supportEmailDelivery.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.supportEmailDelivery.update).mockResolvedValue({} as never);
    return committed;
  }

  it("sends once when an admin actually transitions a ticket into RESOLVED", async () => {
    const committed = configureTicketUpdate("IN_PROGRESS");
    vi.mocked(sendSupportEmailMessage).mockResolvedValue();

    await updateAdminSupportTicket({
      actorId: "admin-id",
      ticketId,
      status: "RESOLVED",
    });

    expect(committed.value).toBe(true);
    expect(prisma.supportEmailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "TICKET_RESOLVED",
          recipientEmail: "registered@example.test",
          locale: "so",
        }),
      }),
    );
    expect(sendSupportEmailMessage).toHaveBeenCalledOnce();
    expect(sendSupportEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "registered@example.test",
        subject: expect.stringContaining("SSQ-261107-ABC123"),
        text: expect.stringContaining("xalliyey"),
      }),
    );
  });

  it("keeps the resolution committed if its email cannot be delivered", async () => {
    configureTicketUpdate("IN_PROGRESS");
    vi.mocked(sendSupportEmailMessage).mockRejectedValue(
      new AppError("EMAIL_DELIVERY_UNAVAILABLE", 503, "Delivery failed."),
    );

    const result = await updateAdminSupportTicket({
      actorId: "admin-id",
      ticketId,
      status: "RESOLVED",
    });

    expect(result.status).toBe("RESOLVED");
    expect(prisma.supportEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastError: "EMAIL_DELIVERY_UNAVAILABLE",
        }),
      }),
    );
  });

  it("does not create another resolution email when the ticket remains RESOLVED", async () => {
    configureTicketUpdate("RESOLVED");

    await updateAdminSupportTicket({
      actorId: "admin-id",
      ticketId,
      status: "RESOLVED",
    });
    expect(prisma.supportEmailDelivery.create).not.toHaveBeenCalled();
    expect(sendSupportEmailMessage).not.toHaveBeenCalled();
  });

  it("keeps CLOSED distinct and does not send the RESOLVED notification", async () => {
    configureTicketUpdate("RESOLVED");

    await updateAdminSupportTicket({
      actorId: "admin-id",
      ticketId,
      status: "CLOSED",
    });

    expect(prisma.supportEmailDelivery.create).not.toHaveBeenCalled();
    expect(sendSupportEmailMessage).not.toHaveBeenCalled();
  });

  it("does not create a resolution email when a concurrent status update wins", async () => {
    configureTicketUpdate("IN_PROGRESS");
    vi.mocked(prisma.supportTicket.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    await expect(
      updateAdminSupportTicket({
        actorId: "admin-id",
        ticketId,
        status: "RESOLVED",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_TICKET_CHANGED", status: 409 });
    expect(prisma.supportEmailDelivery.create).not.toHaveBeenCalled();
    expect(sendSupportEmailMessage).not.toHaveBeenCalled();
  });

  it("allows one database-claimed retry for a failed delivery", async () => {
    vi.mocked(prisma.supportEmailDelivery.findFirst).mockResolvedValue({
      id: deliveryId,
      status: "FAILED",
    } as never);
    vi.mocked(prisma.supportEmailDelivery.findUnique).mockResolvedValue({
      id: deliveryId,
      event: "TICKET_CREATED",
      status: "FAILED",
      recipientEmail: "registered@example.test",
      locale: "en",
      ticketId,
      createdAt: new Date("2026-11-07T07:00:00.000Z"),
      ticket: {
        reference: "SSQ-261107-ABC123",
        subject: "Order needs support",
        createdAt: new Date("2026-11-07T07:00:00.000Z"),
        requesterRole: "CUSTOMER",
      },
    } as never);
    vi.mocked(prisma.supportEmailDelivery.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(sendSupportEmailMessage).mockResolvedValue();
    vi.mocked(prisma.supportEmailDelivery.findUniqueOrThrow).mockResolvedValue({
      id: deliveryId,
      event: "TICKET_CREATED",
      status: "SENT",
      attemptCount: 2,
      lastAttemptAt: new Date("2026-11-07T07:00:00.000Z"),
      lastError: null,
      sentAt: new Date("2026-11-07T07:00:01.000Z"),
    } as never);

    const result = await retrySupportEmailDelivery(ticketId, deliveryId);

    expect(result.status).toBe("SENT");
    expect(prisma.supportEmailDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: deliveryId, ticketId } }),
    );
    expect(prisma.supportEmailDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: deliveryId,
          status: { in: ["PENDING", "FAILED"] },
        },
      }),
    );
    expect(sendSupportEmailMessage).toHaveBeenCalledOnce();
  });

  it("refuses to retry an email already in progress or sent", async () => {
    vi.mocked(prisma.supportEmailDelivery.findFirst).mockResolvedValue({
      id: deliveryId,
      status: "SENDING",
    } as never);

    await expect(
      retrySupportEmailDelivery(ticketId, deliveryId),
    ).rejects.toMatchObject({ code: "SUPPORT_EMAIL_DELIVERY_IN_PROGRESS" });
    expect(sendSupportEmailMessage).not.toHaveBeenCalled();
  });
});

describe("support notification idempotency keys", () => {
  it("derives stable unique keys from the ticket or message event", () => {
    expect(supportTicketCreatedNotificationKey(ticketId)).toBe(
      supportTicketCreatedNotificationKey(ticketId),
    );
    expect(supportMessageNotificationKey("message-one")).toBe(
      supportMessageNotificationKey("message-one"),
    );
    expect(supportMessageNotificationKey("message-one")).not.toBe(
      supportMessageNotificationKey("message-two"),
    );
  });
});

describe("support ticket status workflow", () => {
  it("moves a waiting or resolved requester reply back to active work", () => {
    expect(requesterReplyStatus("WAITING_FOR_CUSTOMER")).toBe("IN_PROGRESS");
    expect(requesterReplyStatus("WAITING_FOR_VENDOR")).toBe("IN_PROGRESS");
    expect(requesterReplyStatus("RESOLVED")).toBe("IN_PROGRESS");
    expect(requesterReplyStatus("OPEN")).toBeUndefined();
  });

  it("waits for the correct requester after a public admin reply", () => {
    expect(adminReplyStatus("CUSTOMER")).toBe("WAITING_FOR_CUSTOMER");
    expect(adminReplyStatus("VENDOR")).toBe("WAITING_FOR_VENDOR");
    expect(adminReplyStatus("ADMIN")).toBeUndefined();
  });
});

describe("support error type", () => {
  it("uses a not-found response for inaccessible ticket IDs", () => {
    const error = new AppError("SUPPORT_TICKET_NOT_FOUND", 404, "Not found.");
    expect(error.status).toBe(404);
  });
});
