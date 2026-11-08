import "server-only";

import { randomBytes } from "node:crypto";
import {
  Prisma,
  type AccountType,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "../../../generated/prisma/client";
import { getAuthConfig } from "@/config/env";
import { sendSupportEmailMessage } from "@/features/auth/email";
import { createSupportEmail } from "@/features/auth/email-templates";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/config";
import {
  readSupportAttachment,
  removeVendorFile,
  saveSupportAttachment,
} from "@/lib/media/vendor-files";
import {
  adminReplyStatus,
  requesterReplyStatus,
  supportMessageNotificationKey,
  supportStatusNotificationKey,
  supportTicketCreatedNotificationKey,
} from "@/features/support/workflow";

export type SupportActor = {
  id: string;
  accountType: AccountType;
};

export const customerTicketCategories = [
  "ORDERS",
  "PAYMENTS",
  "DELIVERY",
  "RETURNS",
  "REFUNDS",
  "ACCOUNT",
  "PRODUCT_ISSUES",
  "SAFETY",
  "OTHER",
] as const satisfies readonly SupportTicketCategory[];

export const vendorTicketCategories = [
  "VENDOR_APPLICATION",
  "STORE_PROFILE",
  "PRODUCT_LISTING",
  "INVENTORY",
  "ORDERS",
  "DELIVERY",
  "COUPONS",
  "COMMISSION_PAYOUTS",
  "ACCOUNT_SECURITY",
  "OTHER",
] as const satisfies readonly SupportTicketCategory[];

type CreateTicketInput = {
  subject: string;
  description: string;
  category: SupportTicketCategory;
  relatedOrderId?: string;
  vendorProfileId?: string;
  productId?: string;
  idempotencyKey: string;
  locale?: Locale;
};

function isRequesterRole(role: AccountType): role is "CUSTOMER" | "VENDOR" {
  return role === "CUSTOMER" || role === "VENDOR";
}

function requireRequesterRole(role: AccountType): "CUSTOMER" | "VENDOR" {
  if (!isRequesterRole(role)) {
    throw new Error("Support ticket requester role is invalid.");
  }
  return role;
}

function safeSupportEmailErrorCode(error: unknown): string {
  if (
    error instanceof AppError &&
    /^[A-Z0-9_]{2,64}$/.test(error.code)
  ) {
    return error.code;
  }
  const name = error instanceof Error ? error.name : "Unknown";
  const safeName = name.replace(/[^A-Za-z0-9_]/g, "").toUpperCase().slice(0, 60);
  return `DELIVERY_${safeName || "FAILED"}`;
}

async function attemptSupportEmailDelivery(
  deliveryId: string,
  retryFailed = false,
) {
  const delivery = await prisma.supportEmailDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      ticket: {
        select: {
          reference: true,
          subject: true,
          createdAt: true,
          requesterRole: true,
        },
      },
    },
  });
  if (!delivery || delivery.status === "SENT") return;

  const claimed = await prisma.supportEmailDelivery.updateMany({
    where: {
      id: delivery.id,
      status: retryFailed ? { in: ["PENDING", "FAILED"] } : "PENDING",
    },
    data: {
      status: "SENDING",
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });
  if (claimed.count !== 1) return;

  let acceptedByProvider = false;
  try {
    const appUrl = new URL(getAuthConfig().appUrl);
    if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
      throw new Error("The application URL protocol is not supported.");
    }
    const audiencePath =
      delivery.ticket.requesterRole === "VENDOR"
        ? "vendor/help"
        : "customer/help";
    const ticketUrl = new URL(
      `/${delivery.locale}/${audiencePath}/tickets/${delivery.ticketId}`,
      appUrl.origin,
    ).toString();
    const message = createSupportEmail({
      event: delivery.event,
      locale: delivery.locale === "so" ? "so" : "en",
      reference: delivery.ticket.reference,
      subject: delivery.ticket.subject,
      ticketUrl,
      createdAt: delivery.ticket.createdAt,
      displayName: null,
    });
    await sendSupportEmailMessage({
      to: delivery.recipientEmail,
      ...message,
    });
    acceptedByProvider = true;
    await prisma.supportEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  } catch (error) {
    const errorCode = safeSupportEmailErrorCode(error);
    if (acceptedByProvider) {
      console.error("[support-email] Provider accepted email; delivery state is uncertain", {
        event: delivery.event,
        errorCode,
      });
      return;
    }
    try {
      await prisma.supportEmailDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", lastError: errorCode },
      });
    } catch {
      console.error("[support-email] Unable to record delivery failure", {
        event: delivery.event,
        errorCode,
      });
    }
    console.error("[support-email] Delivery failure recorded", {
      event: delivery.event,
      errorCode,
    });
  }
}

async function attemptSupportEmailDeliverySafely(deliveryId: string) {
  try {
    await attemptSupportEmailDelivery(deliveryId);
  } catch (error) {
    console.error("[support-email] Delivery dispatch could not start", {
      errorCode: safeSupportEmailErrorCode(error),
    });
  }
}

async function attemptPendingTicketEmail(
  ticketId: string,
  event: "TICKET_CREATED" | "TICKET_RESOLVED",
) {
  try {
    const delivery = await prisma.supportEmailDelivery.findFirst({
      where: { ticketId, event, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (delivery) await attemptSupportEmailDeliverySafely(delivery.id);
  } catch (error) {
    console.error("[support-email] Pending delivery attempt failed", {
      event,
      errorCode: safeSupportEmailErrorCode(error),
    });
  }
}

function ticketReference() {
  const date = new Date();
  const day = `${date.getUTCFullYear().toString().slice(-2)}${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}`;
  return `SSQ-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function assertRelatedRecordsBelongToRequester(
  actor: SupportActor,
  input: CreateTicketInput,
) {
  if (!isRequesterRole(actor.accountType)) {
    throw new AppError("FORBIDDEN", 403, "Only customers and vendors can open tickets.");
  }

  if (input.relatedOrderId) {
    const order =
      actor.accountType === "CUSTOMER"
        ? await prisma.marketplaceOrder.findFirst({
            where: { id: input.relatedOrderId, customerId: actor.id },
            select: { id: true },
          })
        : await prisma.vendorOrder.findFirst({
            where: {
              orderId: input.relatedOrderId,
              vendorId: actor.id,
            },
            select: { id: true },
          });
    if (!order) {
      throw new AppError(
        "INVALID_RELATED_ORDER",
        400,
        "The selected order is not associated with your account.",
      );
    }
  }

  if (input.vendorProfileId) {
    const profile = await prisma.vendorProfile.findFirst({
      where: { id: input.vendorProfileId, userId: actor.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(
        "INVALID_VENDOR_APPLICATION",
        400,
        "The selected vendor application is not associated with your account.",
      );
    }
  }

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: input.productId,
        ...(actor.accountType === "VENDOR" ? { vendorId: actor.id } : { status: "PUBLISHED" }),
      },
      select: { id: true },
    });
    if (!product) {
      throw new AppError(
        "INVALID_RELATED_PRODUCT",
        400,
        "The selected product is not available to your account.",
      );
    }
  }
}

async function createRequesterNotification(
  transaction: Prisma.TransactionClient,
  input: {
    requesterId: string;
    requesterRole: "CUSTOMER" | "VENDOR";
    ticketId: string;
    dedupeKey: string;
    title: string;
    titleSo: string;
    body: string;
    bodySo: string;
    href: string;
  },
) {
  const data = {
    title: input.title,
    titleSo: input.titleSo,
    body: input.body,
    bodySo: input.bodySo,
    entityType: "SUPPORT_TICKET",
    entityId: input.ticketId,
    dedupeKey: input.dedupeKey,
    href: input.href,
  };
  if (input.requesterRole === "CUSTOMER") {
    await transaction.customerNotification.create({
      data: { customerId: input.requesterId, ...data },
    });
  } else {
    await transaction.vendorNotification.create({
      data: { vendorId: input.requesterId, ...data },
    });
  }
}

export async function getSupportContext(actor: SupportActor) {
  if (!isRequesterRole(actor.accountType)) {
    throw new AppError("FORBIDDEN", 403, "Support context is not available.");
  }
  if (actor.accountType === "CUSTOMER") {
    const orders = await prisma.marketplaceOrder.findMany({
      where: { customerId: actor.id },
      select: { id: true, orderNumber: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return {
      categories: customerTicketCategories,
      orders: orders.map((order) => ({
        id: order.id,
        label: order.orderNumber,
      })),
      products: [],
      vendorProfile: null,
    };
  }

  const [profile, orders, products] = await Promise.all([
    prisma.vendorProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true, businessName: true, storeName: true },
    }),
    prisma.vendorOrder.findMany({
      where: { vendorId: actor.id },
      select: {
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.product.findMany({
      where: { vendorId: actor.id },
      select: { id: true, name: true, nameSo: true },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);
  return {
    categories: vendorTicketCategories,
    orders: orders.map(({ order }) => ({
      id: order.id,
      label: order.orderNumber,
    })),
    products: products.map((product) => ({
      id: product.id,
      label: product.name,
      labelSo: product.nameSo,
    })),
    vendorProfile: profile
      ? {
          id: profile.id,
          label: profile.storeName ?? profile.businessName ?? "Vendor application",
        }
      : null,
  };
}

export async function createSupportTicket(
  actor: SupportActor,
  input: CreateTicketInput,
) {
  if (!isRequesterRole(actor.accountType)) {
    throw new AppError("FORBIDDEN", 403, "Only customers and vendors can open tickets.");
  }
  const allowedCategories =
    actor.accountType === "CUSTOMER"
      ? customerTicketCategories
      : vendorTicketCategories;
  if (!allowedCategories.some((category) => category === input.category)) {
    throw new AppError(
      "INVALID_SUPPORT_CATEGORY",
      400,
      "The selected category is not available for your account.",
    );
  }
  await assertRelatedRecordsBelongToRequester(actor, input);

  const existing = await prisma.supportTicket.findUnique({
    where: {
      requesterId_idempotencyKey: {
        requesterId: actor.id,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { id: true, reference: true, status: true },
  });
  if (existing) {
    const message = await prisma.supportMessage.findFirst({
      where: { ticketId: existing.id, senderId: actor.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!message) {
      throw new Error("Support ticket is missing its initial message.");
    }
    await attemptPendingTicketEmail(existing.id, "TICKET_CREATED");
    return { ...existing, messageId: message.id };
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.supportTicket.create({
        data: {
          reference: ticketReference(),
          requesterId: actor.id,
          requesterRole: actor.accountType,
          requesterLocale: input.locale ?? "en",
          subject: input.subject,
          description: input.description,
          category: input.category,
          relatedOrderId: input.relatedOrderId,
          vendorProfileId: input.vendorProfileId,
          productId: input.productId,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true, reference: true, status: true },
      });
      const message = await transaction.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: actor.id,
          senderRole: actor.accountType,
          content: input.description,
          idempotencyKey: `ticket:${input.idempotencyKey}`,
        },
        select: { id: true },
      });
      const activity = await transaction.supportTicketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: actor.id,
          actorRole: actor.accountType,
          type: "CREATED",
        },
        select: { id: true },
      });
      const requester = await transaction.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { email: true },
      });
      const emailDelivery = await transaction.supportEmailDelivery.create({
        data: {
          ticketId: ticket.id,
          activityId: activity.id,
          event: "TICKET_CREATED",
          recipientEmail: requester.email,
          locale: input.locale ?? "en",
        },
        select: { id: true },
      });
      await transaction.adminNotification.create({
        data: {
          type: "SUPPORT_TICKET_CREATED",
          title: "New support ticket",
          titleSo: "Tigidh taageero oo cusub",
          body: `${ticket.reference} was opened by a ${actor.accountType.toLowerCase()}.`,
          bodySo: `${ticket.reference} waxaa furay ${actor.accountType === "CUSTOMER" ? "macmiil" : "iibiye"}.`,
          entityType: "SUPPORT_TICKET",
          entityId: ticket.id,
          dedupeKey: supportTicketCreatedNotificationKey(ticket.id),
          href: `/admin/support/${ticket.id}`,
        },
      });
      return {
        ...ticket,
        messageId: message.id,
        emailDeliveryId: emailDelivery.id,
      };
    });
    await attemptPendingTicketEmail(created.id, "TICKET_CREATED");
    return {
      id: created.id,
      reference: created.reference,
      status: created.status,
      messageId: created.messageId,
    };
  } catch (error) {
    if (!input.idempotencyKey || !isUniqueConstraintError(error)) throw error;
    const ticket = await prisma.supportTicket.findUnique({
      where: {
        requesterId_idempotencyKey: {
          requesterId: actor.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true, reference: true, status: true },
    });
    if (!ticket) throw error;
    const message = await prisma.supportMessage.findFirst({
      where: { ticketId: ticket.id, senderId: actor.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!message) throw error;
    await attemptPendingTicketEmail(ticket.id, "TICKET_CREATED");
    return { ...ticket, messageId: message.id };
  }
}

export async function listSupportTickets(
  actor: SupportActor,
  page = 1,
  pageSize = 20,
) {
  if (!isRequesterRole(actor.accountType)) {
    throw new AppError("FORBIDDEN", 403, "Support tickets are not available.");
  }
  const where = {
    requesterId: actor.id,
    requesterRole: actor.accountType,
  } satisfies Prisma.SupportTicketWhereInput;
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        messages: {
          where: { internalNote: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
            senderRole: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                internalNote: false,
                senderRole: "ADMIN",
                requesterReadAt: null,
              },
            },
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return {
    tickets,
    total,
    page,
    pageSize,
    unreadCount: tickets.reduce(
      (count, ticket) => count + ticket._count.messages,
      0,
    ),
  };
}

async function findVisibleTicket(actor: SupportActor, ticketId: string) {
  const where: Prisma.SupportTicketWhereInput =
    actor.accountType === "ADMIN"
      ? { id: ticketId }
      : {
          id: ticketId,
          requesterId: actor.id,
          requesterRole: actor.accountType,
        };
  const ticket = await prisma.supportTicket.findFirst({ where });
  if (!ticket) {
    throw new AppError("SUPPORT_TICKET_NOT_FOUND", 404, "Support ticket not found.");
  }
  return ticket;
}

export async function getSupportTicket(actor: SupportActor, ticketId: string) {
  const ticket = await findVisibleTicket(actor, ticketId);
  const readAt = new Date();
  if (actor.accountType === "ADMIN") {
    await prisma.$transaction([
      prisma.supportMessage.updateMany({
        where: {
          ticketId,
          senderRole: { not: "ADMIN" },
          staffReadAt: null,
        },
        data: { staffReadAt: readAt },
      }),
      prisma.adminNotification.updateMany({
        where: {
          entityType: "SUPPORT_TICKET",
          entityId: ticketId,
          readAt: null,
        },
        data: { readAt },
      }),
    ]);
  } else if (actor.accountType === "CUSTOMER") {
    await prisma.$transaction([
      prisma.supportMessage.updateMany({
        where: {
          ticketId,
          senderRole: "ADMIN",
          internalNote: false,
          requesterReadAt: null,
        },
        data: { requesterReadAt: readAt },
      }),
      prisma.customerNotification.updateMany({
        where: {
          customerId: actor.id,
          entityType: "SUPPORT_TICKET",
          entityId: ticketId,
          readAt: null,
        },
        data: { readAt },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.supportMessage.updateMany({
        where: {
          ticketId,
          senderRole: "ADMIN",
          internalNote: false,
          requesterReadAt: null,
        },
        data: { requesterReadAt: readAt },
      }),
      prisma.vendorNotification.updateMany({
        where: {
          vendorId: actor.id,
          entityType: "SUPPORT_TICKET",
          entityId: ticketId,
          readAt: null,
        },
        data: { readAt },
      }),
    ]);
  }

  const isAdmin = actor.accountType === "ADMIN";
  return prisma.supportTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: {
      requester: {
        select: { id: true, displayName: true, email: true, accountType: true },
      },
      assignedTo: {
        select: { id: true, displayName: true, email: true },
      },
      relatedOrder: {
        select: { id: true, orderNumber: true },
      },
      vendorProfile: {
        select: { id: true, businessName: true, storeName: true },
      },
      product: {
        select: { id: true, name: true, nameSo: true },
      },
      messages: {
        where: isAdmin ? {} : { internalNote: false },
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, displayName: true, accountType: true },
          },
          attachments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      activities: {
        where: isAdmin
          ? {}
          : { type: { not: "INTERNAL_NOTE_ADDED" } },
        orderBy: { createdAt: "asc" },
        include: {
          actor: {
            select: { displayName: true, accountType: true },
          },
        },
      },
      ...(isAdmin
        ? {
            emailDeliveries: {
              select: {
                id: true,
                event: true,
                status: true,
                attemptCount: true,
                lastAttemptAt: true,
                lastError: true,
                sentAt: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" as const },
            },
          }
        : {}),
      _count: {
        select: {
          messages: {
            where: isAdmin
              ? {
                  senderRole: { not: "ADMIN" },
                  staffReadAt: null,
                }
              : {
                  senderRole: "ADMIN",
                  requesterReadAt: null,
                  internalNote: false,
                },
          },
        },
      },
    },
  });
}

export async function getSupportTicketAIContext(
  actor: SupportActor,
  ticketId: string,
) {
  const ticket = await findVisibleTicket(actor, ticketId);
  return {
    reference: ticket.reference,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
  };
}

type AddMessageInput = {
  content: string;
  internalNote: boolean;
  idempotencyKey: string;
};

export async function addSupportMessage(
  actor: SupportActor,
  ticketId: string,
  input: AddMessageInput,
) {
  const ticket = await findVisibleTicket(actor, ticketId);
  if (!isRequesterRole(actor.accountType) && actor.accountType !== "ADMIN") {
    throw new AppError("FORBIDDEN", 403, "You cannot reply to this ticket.");
  }
  const internalNote = actor.accountType === "ADMIN" && input.internalNote;
  const existingMessage = await prisma.supportMessage.findUnique({
    where: {
      senderId_idempotencyKey: {
        senderId: actor.id,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { id: true, ticketId: true },
  });
  if (existingMessage) {
    if (existingMessage.ticketId !== ticket.id) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        409,
        "This request key has already been used for another message.",
      );
    }
    return existingMessage;
  }
  if (ticket.status === "CLOSED") {
    throw new AppError(
      "SUPPORT_TICKET_CLOSED",
      409,
      "This ticket is closed and cannot receive new messages.",
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const message = await transaction.supportMessage.create({
        data: {
          ticketId,
          senderId: actor.id,
          senderRole: actor.accountType,
          content: input.content,
          internalNote,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true, ticketId: true, createdAt: true },
      });
      const nextStatus: SupportTicketStatus | undefined = internalNote
        ? undefined
        : actor.accountType === "ADMIN"
          ? adminReplyStatus(ticket.requesterRole)
          : requesterReplyStatus(ticket.status);
      const updatedTicket = await transaction.supportTicket.update({
        where: { id: ticketId },
        data: {
          updatedAt: new Date(),
          ...(nextStatus && nextStatus !== ticket.status
            ? {
                status: nextStatus,
                resolvedAt: null,
                closedAt: null,
              }
            : {}),
        },
        select: { reference: true, status: true, requesterId: true, requesterRole: true },
      });
      await transaction.supportTicketActivity.create({
        data: {
          ticketId,
          actorId: actor.id,
          actorRole: actor.accountType,
          type: internalNote ? "INTERNAL_NOTE_ADDED" : "MESSAGE_ADDED",
          metadata: { messageId: message.id },
        },
      });
      if (!internalNote) {
        if (actor.accountType === "ADMIN") {
          await createRequesterNotification(transaction, {
            requesterId: updatedTicket.requesterId,
            requesterRole: requireRequesterRole(updatedTicket.requesterRole),
            ticketId,
            dedupeKey: supportMessageNotificationKey(message.id),
            title: "Support replied to your ticket",
            titleSo: "Taageeradu waxay ka jawaabtay tigidhkaaga",
            body: `A support agent replied to ${updatedTicket.reference}.`,
            bodySo: `Shaqaale taageero ayaa ka jawaabay ${updatedTicket.reference}.`,
            href: `/${updatedTicket.requesterRole.toLowerCase()}/help/tickets/${ticketId}`,
          });
        } else {
          await transaction.adminNotification.create({
            data: {
              type: "SUPPORT_CUSTOMER_REPLY",
              title: "New support reply",
              titleSo: "Jawaab taageero oo cusub",
              body: `${updatedTicket.reference} received a reply from its requester.`,
              bodySo: `${updatedTicket.reference} waxaa jawaab ka bixiyey qofkii furay.`,
              entityType: "SUPPORT_TICKET",
              entityId: ticketId,
              dedupeKey: supportMessageNotificationKey(message.id),
              href: `/admin/support/${ticketId}`,
            },
          });
        }
      }
      if (nextStatus && nextStatus !== ticket.status) {
        await transaction.supportTicketActivity.create({
          data: {
            ticketId,
            actorId: actor.id,
            actorRole: actor.accountType,
            type: "STATUS_CHANGED",
            metadata: { from: ticket.status, to: nextStatus },
          },
        });
        if (actor.accountType !== "ADMIN") {
          await transaction.adminNotification.create({
            data: {
              type: "SUPPORT_TICKET_STATUS_CHANGED",
              title: "Support ticket status changed",
              titleSo: "Xaaladda tigidhka taageerada waa la beddelay",
              body: `${updatedTicket.reference} is now ${nextStatus.toLowerCase().replaceAll("_", " ")}.`,
              bodySo: `${updatedTicket.reference} hadda waa ${nextStatus.toLowerCase().replaceAll("_", " ")}.`,
              entityType: "SUPPORT_TICKET",
              entityId: ticketId,
              dedupeKey: supportStatusNotificationKey(
                ticketId,
                ticket.status,
                nextStatus,
                ticket.updatedAt,
              ),
              href: `/admin/support/${ticketId}`,
            },
          });
        }
      }
      return message;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const message = await prisma.supportMessage.findUnique({
      where: {
        senderId_idempotencyKey: {
          senderId: actor.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true, ticketId: true, createdAt: true },
    });
    if (!message || message.ticketId !== ticket.id) throw error;
    return message;
  }
}

export async function listAdminSupportTickets(input: {
  search?: string;
  requesterRole?: "CUSTOMER" | "VENDOR";
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(input.requesterRole ? { requesterRole: input.requesterRole } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.search
      ? {
          OR: [
            { reference: { contains: input.search, mode: "insensitive" } },
            { subject: { contains: input.search, mode: "insensitive" } },
            {
              requester: {
                is: {
                  OR: [
                    { email: { contains: input.search, mode: "insensitive" } },
                    {
                      displayName: {
                        contains: input.search,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        requester: {
          select: { id: true, displayName: true, email: true, accountType: true },
        },
        assignedTo: {
          select: { id: true, displayName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderRole: true, internalNote: true, createdAt: true },
        },
        _count: {
          select: {
            messages: {
              where: {
                internalNote: false,
                senderRole: { not: "ADMIN" },
                staffReadAt: null,
              },
            },
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return {
    tickets,
    total,
    page: input.page,
    pageSize: input.pageSize,
    unreadCount: tickets.reduce(
      (count, ticket) => count + ticket._count.messages,
      0,
    ),
  };
}

export async function updateAdminSupportTicket(input: {
  actorId: string;
  ticketId: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assignedToId?: string | null;
}) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw new AppError("SUPPORT_TICKET_NOT_FOUND", 404, "Support ticket not found.");
  }
  if (input.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.assignedToId,
        accountType: "ADMIN",
        isActive: true,
      },
      select: { id: true },
    });
    if (!assignee) {
      throw new AppError(
        "INVALID_SUPPORT_ASSIGNEE",
        400,
        "The selected support assignee is not an active administrator.",
      );
    }
  }

  const updatedResult = await prisma.$transaction(async (transaction) => {
    const statusChanged = input.status !== undefined && input.status !== ticket.status;
    const priorityChanged =
      input.priority !== undefined && input.priority !== ticket.priority;
    const assignmentChanged =
      input.assignedToId !== undefined &&
      input.assignedToId !== ticket.assignedToId;
    const updatedCount = await transaction.supportTicket.updateMany({
      where: { id: ticket.id, status: ticket.status },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: input.assignedToId }
          : {}),
        ...(statusChanged
          ? {
              resolvedAt:
                input.status === "RESOLVED" ? new Date() : null,
              closedAt: input.status === "CLOSED" ? new Date() : null,
            }
          : {}),
      },
    });
    if (updatedCount.count !== 1) {
      throw new AppError(
        "SUPPORT_TICKET_CHANGED",
        409,
        "The support ticket changed. Refresh and try again.",
      );
    }
    const updated = await transaction.supportTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { id: true, reference: true, requesterId: true, requesterRole: true },
    });

    let emailDeliveryId: string | undefined;
    if (statusChanged && input.status) {
      const activity = await transaction.supportTicketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: input.actorId,
          actorRole: "ADMIN",
          type: "STATUS_CHANGED",
          metadata: { from: ticket.status, to: input.status },
        },
        select: { id: true },
      });
      await createRequesterNotification(transaction, {
        requesterId: ticket.requesterId,
        requesterRole: requireRequesterRole(ticket.requesterRole),
        ticketId: ticket.id,
        dedupeKey: supportStatusNotificationKey(
          ticket.id,
          ticket.status,
          input.status,
          ticket.updatedAt,
        ),
        title: "Support ticket status updated",
        titleSo: "Xaaladda tigidhka taageerada waa la cusboonaysiiyey",
        body: `${ticket.reference} is now ${input.status.toLowerCase().replaceAll("_", " ")}.`,
        bodySo: `${ticket.reference} hadda waa ${input.status.toLowerCase().replaceAll("_", " ")}.`,
        href: `/${ticket.requesterRole.toLowerCase()}/help/tickets/${ticket.id}`,
      });
      if (input.status === "RESOLVED") {
        const requester = await transaction.user.findUniqueOrThrow({
          where: { id: ticket.requesterId },
          select: { email: true },
        });
        const delivery = await transaction.supportEmailDelivery.create({
          data: {
            ticketId: ticket.id,
            activityId: activity.id,
            event: "TICKET_RESOLVED",
            recipientEmail: requester.email,
            locale: ticket.requesterLocale,
          },
          select: { id: true },
        });
        emailDeliveryId = delivery.id;
      }
    }
    if (priorityChanged && input.priority) {
      await transaction.supportTicketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: input.actorId,
          actorRole: "ADMIN",
          type: "PRIORITY_CHANGED",
          metadata: { from: ticket.priority, to: input.priority },
        },
      });
      await createRequesterNotification(transaction, {
        requesterId: ticket.requesterId,
        requesterRole: requireRequesterRole(ticket.requesterRole),
        ticketId: ticket.id,
        dedupeKey: `support-priority:${ticket.id}:${ticket.priority}:${input.priority}:${ticket.updatedAt.toISOString()}`,
        title: "Support ticket priority updated",
        titleSo: "Mudnaanta tigidhka taageerada waa la cusboonaysiiyey",
        body: `${ticket.reference} priority was changed to ${input.priority.toLowerCase()}.`,
        bodySo: `Mudnaanta ${ticket.reference} waxaa loo beddelay ${input.priority.toLowerCase()}.`,
        href: `/${ticket.requesterRole.toLowerCase()}/help/tickets/${ticket.id}`,
      });
    }
    if (assignmentChanged) {
      await transaction.supportTicketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: input.actorId,
          actorRole: "ADMIN",
          type: "ASSIGNED",
          metadata: { from: ticket.assignedToId, to: input.assignedToId ?? null },
        },
      });
      await transaction.adminNotification.create({
        data: {
          type: "SUPPORT_TICKET_ASSIGNED",
          title: input.assignedToId ? "Support ticket assigned" : "Support ticket unassigned",
          titleSo: input.assignedToId ? "Tigidh taageero ayaa la qoondeeyey" : "Tigidh taageero waa laga saaray qofkii loo qoondeeyey",
          body: `${ticket.reference} assignment was updated.`,
          bodySo: `Qoondeynta ${ticket.reference} waa la cusboonaysiiyey.`,
          entityType: "SUPPORT_TICKET",
          entityId: ticket.id,
          dedupeKey: `support-assignment:${ticket.id}:${input.actorId}:${ticket.updatedAt.toISOString()}`,
          href: `/admin/support/${ticket.id}`,
        },
      });
    }
    return {
      ...updated,
      status: input.status ?? ticket.status,
      priority: input.priority ?? ticket.priority,
      ...(emailDeliveryId ? { emailDeliveryId } : {}),
    };
  });
  if (updatedResult.emailDeliveryId) {
    await attemptSupportEmailDeliverySafely(updatedResult.emailDeliveryId);
  }
  return {
    id: updatedResult.id,
    reference: updatedResult.reference,
    status: updatedResult.status,
    priority: updatedResult.priority,
  };
}

export async function retrySupportEmailDelivery(
  ticketId: string,
  deliveryId: string,
) {
  const delivery = await prisma.supportEmailDelivery.findFirst({
    where: { id: deliveryId, ticketId },
    select: { id: true, status: true },
  });
  if (!delivery) {
    throw new AppError(
      "SUPPORT_EMAIL_DELIVERY_NOT_FOUND",
      404,
      "Support email delivery not found.",
    );
  }
  if (delivery.status === "SENT") {
    throw new AppError(
      "SUPPORT_EMAIL_ALREADY_SENT",
      409,
      "This support email was already accepted by the email provider.",
    );
  }
  if (delivery.status === "SENDING") {
    throw new AppError(
      "SUPPORT_EMAIL_DELIVERY_IN_PROGRESS",
      409,
      "This support email is already being sent.",
    );
  }

  await attemptSupportEmailDelivery(delivery.id, true);
  return prisma.supportEmailDelivery.findUniqueOrThrow({
    where: { id: delivery.id },
    select: {
      id: true,
      event: true,
      status: true,
      attemptCount: true,
      lastAttemptAt: true,
      lastError: true,
      sentAt: true,
    },
  });
}

export async function addSupportAttachment(
  actor: SupportActor,
  messageId: string,
  file: File,
  idempotencyKey: string,
) {
  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
    include: { ticket: true },
  });
  if (
    !message ||
    message.senderId !== actor.id ||
    (actor.accountType !== "ADMIN" &&
      (message.ticket.requesterId !== actor.id ||
        message.ticket.requesterRole !== actor.accountType ||
        message.internalNote))
  ) {
    throw new AppError("SUPPORT_MESSAGE_NOT_FOUND", 404, "Support message not found.");
  }

  const existing = await prisma.supportAttachment.findUnique({
    where: {
      uploadedById_idempotencyKey: {
        uploadedById: actor.id,
        idempotencyKey,
      },
    },
    select: {
      id: true,
      messageId: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
  if (existing) {
    if (existing.messageId !== messageId) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        409,
        "This request key has already been used for another attachment.",
      );
    }
    return existing;
  }

  const stored = await saveSupportAttachment(file);
  try {
    return await prisma.supportAttachment.create({
      data: {
        messageId,
        uploadedById: actor.id,
        idempotencyKey,
        ...stored,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  } catch (error) {
    await removeVendorFile(stored.storageKey);
    if (!isUniqueConstraintError(error)) throw error;
    const attachment = await prisma.supportAttachment.findUnique({
      where: {
        uploadedById_idempotencyKey: {
          uploadedById: actor.id,
          idempotencyKey,
        },
      },
      select: {
        id: true,
        messageId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    if (!attachment || attachment.messageId !== messageId) throw error;
    return attachment;
  }
}

export async function getSupportAttachment(actor: SupportActor, attachmentId: string) {
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        include: { ticket: true },
      },
    },
  });
  if (
    !attachment ||
    (actor.accountType !== "ADMIN" &&
      (attachment.message.internalNote ||
        attachment.message.ticket.requesterId !== actor.id ||
        attachment.message.ticket.requesterRole !== actor.accountType))
  ) {
    throw new AppError("SUPPORT_ATTACHMENT_NOT_FOUND", 404, "Attachment not found.");
  }
  const bytes = await readSupportAttachment(attachment.storageKey);
  return {
    bytes,
    filename: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}
