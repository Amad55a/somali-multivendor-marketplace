import "server-only";

import { Prisma } from "../../../generated/prisma/client";
import type {
  CommunicationReportReason,
  CommunicationReportStatus,
} from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import {
  createLocationAttachment,
  locationAttachmentSchema,
  locationCoordinatesSchema,
} from "@/features/communications/location";

function getPresenceStatus(ageMs: number): "online" | "away" | "offline" {
  if (ageMs < 90_000) return "online";
  if (ageMs < 10 * 60_000) return "away";
  return "offline";
}

type ConversationAccess = {
  id: string;
  customerId: string;
  vendorId: string;
  customer: {
    id: string;
    displayName: string | null;
    isActive: boolean;
  };
  vendor: {
    id: string;
    displayName: string | null;
    isActive: boolean;
    vendorProfile: {
      storeName: string | null;
      applicationStatus: string;
      files: { id: string }[];
    } | null;
  };
};

function assertBuyerOrVendor(user: AuthenticatedUser): asserts user is AuthenticatedUser & {
  accountType: "CUSTOMER" | "VENDOR";
} {
  if (user.accountType !== "CUSTOMER" && user.accountType !== "VENDOR") {
    throw new AppError("FORBIDDEN", 403, "Messaging is available to customers and vendors.");
  }
}

function otherParticipantId(conversation: ConversationAccess, userId: string): string {
  if (conversation.customerId === userId) return conversation.vendorId;
  if (conversation.vendorId === userId) return conversation.customerId;
  throw new AppError("CONVERSATION_NOT_FOUND", 404, "Conversation not found.");
}

export async function requireConversationParticipant(
  conversationId: string,
  user: AuthenticatedUser,
): Promise<ConversationAccess> {
  assertBuyerOrVendor(user);
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ customerId: user.id }, { vendorId: user.id }],
    },
    select: {
      id: true,
      customerId: true,
      vendorId: true,
      customer: { select: { id: true, displayName: true, isActive: true } },
      vendor: {
        select: {
          id: true,
          displayName: true,
          isActive: true,
          vendorProfile: {
            select: {
              storeName: true,
              applicationStatus: true,
              files: {
                where: { fileType: "STORE_LOGO" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!conversation) {
    throw new AppError("CONVERSATION_NOT_FOUND", 404, "Conversation not found.");
  }
  return conversation;
}

async function assertCanMessage(
  conversation: ConversationAccess,
  userId: string,
): Promise<string> {
  const recipientId = otherParticipantId(conversation, userId);
  const [blocked, recipient] = await Promise.all([
    prisma.communicationBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: userId },
        ],
      },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: {
        isActive: true,
        accountType: true,
        vendorProfile: { select: { applicationStatus: true } },
      },
    }),
  ]);
  if (blocked) {
    throw new AppError(
      "MESSAGING_BLOCKED",
      403,
      "A participant has blocked communication in this conversation.",
    );
  }
  if (
    !recipient?.isActive ||
    (recipient.accountType === "VENDOR" &&
      recipient.vendorProfile?.applicationStatus !== "APPROVED")
  ) {
    throw new AppError(
      "VENDOR_UNAVAILABLE",
      409,
      "This vendor is not currently available for new messages.",
    );
  }
  if (
    userId === conversation.customerId &&
    (!conversation.vendor.isActive ||
      conversation.vendor.vendorProfile?.applicationStatus !== "APPROVED")
  ) {
    throw new AppError(
      "VENDOR_UNAVAILABLE",
      409,
      "This vendor is not currently available for new messages.",
    );
  }
  if (
    userId === conversation.vendorId &&
    (!conversation.vendor.isActive ||
      conversation.vendor.vendorProfile?.applicationStatus !== "APPROVED")
  ) {
    throw new AppError(
      "VENDOR_UNAVAILABLE",
      409,
      "This vendor is not currently available for new messages.",
    );
  }
  return recipientId;
}

function getParticipantSummary(
  conversation: ConversationAccess,
  userId: string,
) {
  if (userId === conversation.customerId) {
    const profile = conversation.vendor.vendorProfile;
    return {
      id: conversation.vendor.id,
      name: profile?.storeName ?? conversation.vendor.displayName ?? "Vendor",
      isVendor: true,
      logoUrl: profile?.files[0]
        ? `/api/v1/vendors/${conversation.vendor.id}/logo`
        : null,
    };
  }
  return {
    id: conversation.customer.id,
    name: conversation.customer.displayName ?? "Customer",
    isVendor: false,
    logoUrl: null,
  };
}

function getConversationWhere(user: AuthenticatedUser): Prisma.ConversationWhereInput {
  assertBuyerOrVendor(user);
  return user.accountType === "CUSTOMER"
    ? { customerId: user.id }
    : { vendorId: user.id };
}

export async function listConversations(user: AuthenticatedUser, search: string) {
  assertBuyerOrVendor(user);
  const where: Prisma.ConversationWhereInput = getConversationWhere(user);
  const term = search.trim().slice(0, 100);
  if (term) {
    where.OR = [
      { customer: { displayName: { contains: term, mode: "insensitive" } } },
      {
        vendor: {
          vendorProfile: {
            is: { storeName: { contains: term, mode: "insensitive" } },
          },
        },
      },
      { messages: { some: { content: { contains: term, mode: "insensitive" } } } },
    ];
  }
  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      customerId: true,
      vendorId: true,
      updatedAt: true,
      customer: { select: { id: true, displayName: true, isActive: true } },
      vendor: {
        select: {
          id: true,
          displayName: true,
          isActive: true,
          vendorProfile: {
            select: {
              storeName: true,
              applicationStatus: true,
              files: {
                where: { fileType: "STORE_LOGO" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          type: true,
          content: true,
          attachmentData: true,
          senderId: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: {
            where: { senderId: { not: user.id }, readAt: null },
          },
        },
      },
    },
  });

  return {
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      participant: getParticipantSummary(conversation, user.id),
      latestMessage: conversation.messages[0]
        ? {
            ...conversation.messages[0],
            createdAt: conversation.messages[0].createdAt.toISOString(),
          }
        : null,
      unreadCount: conversation._count.messages,
      updatedAt: conversation.updatedAt.toISOString(),
    })),
  };
}

async function productSnapshot(
  productId: string,
  conversation: ConversationAccess,
): Promise<{ data: Prisma.InputJsonValue; availability: "AVAILABLE" | "SOLD_OUT" | "UNAVAILABLE" }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      vendorId: true,
      name: true,
      nameSo: true,
      status: true,
      variants: {
        where: { isActive: true },
        orderBy: { price: "asc" },
        select: { id: true, price: true, stockQuantity: true },
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true },
        take: 1,
      },
      vendor: {
        select: {
          id: true,
          isActive: true,
          vendorProfile: { select: { storeName: true, applicationStatus: true } },
        },
      },
    },
  });
  if (!product || product.vendorId !== conversation.vendorId) {
    throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found for this conversation.");
  }
  const available = product.status === "PUBLISHED" &&
    product.vendor.isActive &&
    product.vendor.vendorProfile?.applicationStatus === "APPROVED";
  const inStock = product.variants.some((variant) => variant.stockQuantity > 0);
  const availability = !available
    ? "UNAVAILABLE"
    : inStock
      ? "AVAILABLE"
      : "SOLD_OUT";
  const price = product.variants[0]?.price.toString() ?? null;
  return {
    availability,
    data: {
      productId: product.id,
      name: product.name,
      nameSo: product.nameSo,
      price,
      currency: "USD",
      storeName: product.vendor.vendorProfile?.storeName ?? "Somsuuq Vendor",
      imageUrl: product.images[0]
        ? `/api/v1/products/images/${product.images[0].id}`
        : null,
      href: `/marketplace/${product.id}`,
      availability,
    },
  };
}

export async function openProductConversation(
  user: AuthenticatedUser,
  productId: string,
) {
  if (user.accountType !== "CUSTOMER") {
    throw new AppError("FORBIDDEN", 403, "Only customers can start a vendor conversation.");
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      vendorId: true,
      status: true,
      vendor: {
        select: {
          id: true,
          isActive: true,
          vendorProfile: { select: { applicationStatus: true } },
        },
      },
    },
  });
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  if (product.vendorId === user.id) {
    throw new AppError("SELF_CONTACT_NOT_ALLOWED", 403, "You cannot contact your own store.");
  }
  if (
    product.status !== "PUBLISHED" ||
    !product.vendor.isActive ||
    product.vendor.vendorProfile?.applicationStatus !== "APPROVED"
  ) {
    throw new AppError(
      "VENDOR_UNAVAILABLE",
      409,
      "This product's vendor is not currently available for contact.",
    );
  }
  const existingConversation = await prisma.conversation.findUnique({
    where: { customerId_vendorId: { customerId: user.id, vendorId: product.vendorId } },
    select: { id: true },
  });
  const blocked = await prisma.communicationBlock.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: product.vendorId },
        { blockerId: product.vendorId, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked && !existingConversation) {
    throw new AppError(
      "MESSAGING_BLOCKED",
      403,
      "A participant has blocked communication with this vendor.",
    );
  }

  if (blocked && existingConversation) {
    return { conversationId: existingConversation.id };
  }
  const conversation = existingConversation ?? await prisma.conversation.upsert({
    where: { customerId_vendorId: { customerId: user.id, vendorId: product.vendorId } },
    create: { customerId: user.id, vendorId: product.vendorId },
    update: {},
    select: { id: true },
  });
  const access = await requireConversationParticipant(conversation.id, user);
  const snapshot = await productSnapshot(productId, access);
  const existing = await prisma.conversationMessage.findUnique({
    where: {
      conversationId_productId: {
        conversationId: conversation.id,
        productId,
      },
    },
    select: { id: true },
  });
  if (!existing) {
    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        type: "PRODUCT",
        productId,
        attachmentData: snapshot.data,
        clientMessageId: `product:${productId}`,
      },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      prisma.vendorNotification.upsert({
        where: { dedupeKey: `conversation-message:${message.id}` },
        create: {
          vendorId: product.vendorId,
          title: "A customer contacted you",
          titleSo: "Macmiil ayaa kula soo xiriiray",
          body: "A customer shared a product and started a conversation.",
          bodySo: "Macmiil ayaa alaab kula wadaagay oo bilaabay wada sheekaysi.",
          entityType: "CONVERSATION",
          entityId: conversation.id,
          dedupeKey: `conversation-message:${message.id}`,
          href: `/vendor/messages?conversationId=${conversation.id}`,
        },
        update: {},
      }),
    ]);
  }
  return { conversationId: conversation.id };
}

async function createNotification(
  transaction: Prisma.TransactionClient,
  conversation: ConversationAccess,
  senderId: string,
  messageId: string,
) {
  const recipientId = otherParticipantId(conversation, senderId);
  const dedupeKey = `conversation-message:${messageId}`;
  const href = `/customer/messages?conversationId=${conversation.id}`;
  if (recipientId === conversation.customerId) {
    await transaction.customerNotification.upsert({
      where: { dedupeKey },
      create: {
        customerId: recipientId,
        title: "New message",
        titleSo: "Farriin cusub",
        body: "You have a new message from a vendor.",
        bodySo: "Waxaad farriin cusub ka heshay iibiyaha.",
        entityType: "CONVERSATION",
        entityId: conversation.id,
        dedupeKey,
        href,
      },
      update: {},
    });
  } else {
    await transaction.vendorNotification.upsert({
      where: { dedupeKey },
      create: {
        vendorId: recipientId,
        title: "New message",
        titleSo: "Farriin cusub",
        body: "You have a new message from a customer.",
        bodySo: "Waxaad farriin cusub ka heshay macmiil.",
        entityType: "CONVERSATION",
        entityId: conversation.id,
        dedupeKey,
        href: `/vendor/messages?conversationId=${conversation.id}`,
      },
      update: {},
    });
  }
}

export async function sendConversationMessage(
  user: AuthenticatedUser,
  conversationId: string,
  input: {
    clientMessageId: string;
    content?: string;
    productId?: string;
    orderId?: string;
    location?: { latitude: number; longitude: number };
  },
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const recipientId = await assertCanMessage(conversation, user.id);
  const kindCount = Number(Boolean(input.content?.trim())) +
    Number(Boolean(input.productId)) +
    Number(Boolean(input.orderId)) +
    Number(Boolean(input.location));
  if (kindCount !== 1) {
    throw new AppError("INVALID_MESSAGE", 400, "Send one text, product, order, or location attachment at a time.");
  }

  let type: "TEXT" | "PRODUCT" | "ORDER" = "TEXT";
  let productId: string | null = null;
  let attachmentData: Prisma.InputJsonValue | undefined;
  let content = input.content?.trim() || null;
  const locationAttachment = input.location
    ? createLocationAttachment(locationCoordinatesSchema.parse(input.location))
    : null;

  if (input.productId) {
    const snapshot = await productSnapshot(input.productId, conversation);
    type = "PRODUCT";
    productId = input.productId;
    attachmentData = snapshot.data;
    content = null;
  } else if (input.orderId) {
    const vendorOrder = await prisma.vendorOrder.findFirst({
      where: {
        orderId: input.orderId,
        vendorId: conversation.vendorId,
        order: { customerId: conversation.customerId },
      },
      select: {
        id: true,
        status: true,
        order: { select: { id: true, orderNumber: true, status: true } },
        lines: {
          select: {
            productName: true,
            productNameSo: true,
            variantName: true,
            quantity: true,
            unitPrice: true,
            imageId: true,
          },
        },
      },
    });
    if (!vendorOrder) {
      throw new AppError(
        "ORDER_NOT_FOUND",
        404,
        "No order shared by both participants was found.",
      );
    }
    type = "ORDER";
    content = null;
    attachmentData = {
      orderId: vendorOrder.order.id,
      orderNumber: vendorOrder.order.orderNumber,
      marketplaceStatus: vendorOrder.order.status,
      vendorOrderStatus: vendorOrder.status,
      href:
        user.id === conversation.customerId
          ? `/customer/orders/${vendorOrder.order.id}`
          : `/vendor/orders?orderId=${vendorOrder.id}`,
      items: vendorOrder.lines.map((line) => ({
        name: line.productName,
        nameSo: line.productNameSo,
        variantName: line.variantName,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        imageUrl: line.imageId
          ? `/api/v1/products/images/${line.imageId}`
          : null,
      })),
    };
  } else if (input.location) {
    if (locationAttachment) attachmentData = locationAttachment;
    content = null;
  }

  const existing = await prisma.conversationMessage.findUnique({
    where: {
      conversationId_senderId_clientMessageId: {
        conversationId,
        senderId: user.id,
        clientMessageId: input.clientMessageId,
      },
    },
    select: { id: true, type: true, content: true, attachmentData: true },
  });
  if (existing) {
    const previousLocation = locationAttachmentSchema.safeParse(existing.attachmentData);
    const sameLocation = input.location
      ? previousLocation.success &&
        previousLocation.data.latitude === locationAttachment?.latitude &&
        previousLocation.data.longitude === locationAttachment?.longitude
      : true;
    if (existing.content !== content || existing.type !== type || !sameLocation) {
      throw new AppError("IDEMPOTENCY_CONFLICT", 409, "This message identifier was already used.");
    }
    return { message: await getMessage(existing.id, user.id), recipientId, duplicate: true };
  }

  const message = await prisma.$transaction(async (transaction) => {
    const created = await transaction.conversationMessage.create({
      data: {
        conversationId,
        senderId: user.id,
        type,
        content,
        productId,
        attachmentData,
        clientMessageId: input.clientMessageId,
      },
      select: { id: true },
    });
    await transaction.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    await createNotification(transaction, conversation, user.id, created.id);
    return created;
  });
  return {
    message: await getMessage(message.id, user.id),
    recipientId,
    duplicate: false,
  };
}

async function getProductAvailability(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, string>();
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      status: true,
      variants: { where: { isActive: true, stockQuantity: { gt: 0 } }, select: { id: true }, take: 1 },
      vendor: {
        select: {
          isActive: true,
          vendorProfile: { select: { applicationStatus: true } },
        },
      },
    },
  });
  const availability = new Map<string, string>();
  for (const productId of productIds) {
    const product = products.find((candidate) => candidate.id === productId);
    availability.set(
      productId,
      !product ||
        product.status !== "PUBLISHED" ||
        !product.vendor.isActive ||
        product.vendor.vendorProfile?.applicationStatus !== "APPROVED"
        ? "UNAVAILABLE"
        : product.variants.length > 0
          ? "AVAILABLE"
          : "SOLD_OUT",
    );
  }
  return availability;
}

async function serializeMessages(
  messages: Prisma.ConversationMessageGetPayload<{
    include: {
      sender: { select: { id: true; displayName: true } };
      attachments: {
        select: {
          id: true;
          originalName: true;
          mimeType: true;
          sizeBytes: true;
        };
      };
    };
  }>[],
) {
  const availability = await getProductAvailability(
    messages.flatMap((message) => (message.productId ? [message.productId] : [])),
  );
  return messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    attachmentData:
      message.productId && message.attachmentData
        ? {
            ...(message.attachmentData as Record<string, unknown>),
            availability: availability.get(message.productId) ?? "UNAVAILABLE",
          }
        : message.attachmentData,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    readAt: message.readAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
    sender: {
      id: message.sender.id,
      displayName: message.sender.displayName,
    },
  }));
}

export async function getMessage(messageId: string, userId: string) {
  const message = await prisma.conversationMessage.findFirst({
    where: {
      id: messageId,
      conversation: {
        OR: [{ customerId: userId }, { vendorId: userId }],
      },
    },
    include: {
      sender: { select: { id: true, displayName: true } },
      attachments: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });
  if (!message) throw new AppError("MESSAGE_NOT_FOUND", 404, "Message not found.");
  return (await serializeMessages([message]))[0];
}

export async function listConversationMessages(
  user: AuthenticatedUser,
  conversationId: string,
  beforeId?: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  let beforeCreatedAt: Date | undefined;
  if (beforeId) {
    const cursor = await prisma.conversationMessage.findFirst({
      where: { id: beforeId, conversationId },
      select: { createdAt: true },
    });
    if (!cursor) throw new AppError("MESSAGE_NOT_FOUND", 404, "Message not found.");
    beforeCreatedAt = cursor.createdAt;
  }
  const fetched = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31,
    include: {
      sender: { select: { id: true, displayName: true } },
      attachments: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });
  const page = fetched.slice(0, 30);
  const incomingIds = page
    .filter((message) => message.senderId !== user.id)
    .map((message) => message.id);
  if (incomingIds.length > 0) {
    const now = new Date();
    await prisma.conversationMessage.updateMany({
      where: {
        id: { in: incomingIds },
        OR: [{ deliveredAt: null }, { readAt: null }],
      },
      data: { deliveredAt: now, readAt: now },
    });
  }
  await prisma.conversationPresence.upsert({
    where: {
      conversationId_userId: { conversationId, userId: user.id },
    },
    create: { conversationId, userId: user.id },
    update: { heartbeatAt: new Date(), lastSeenAt: new Date() },
  });
  const ids = page.map((message) => message.id);
  const refreshed = ids.length
    ? await prisma.conversationMessage.findMany({
        where: { id: { in: ids } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          sender: { select: { id: true, displayName: true } },
          attachments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      })
    : [];
  const blocks = await prisma.communicationBlock.findMany({
    where: {
      OR: [
        { blockerId: user.id, blockedId: otherParticipantId(conversation, user.id) },
        { blockerId: otherParticipantId(conversation, user.id), blockedId: user.id },
      ],
    },
    select: { blockerId: true },
  });
  const blockedByCurrentUser = blocks.some((block) => block.blockerId === user.id);
  const blockedByOtherParticipant = blocks.some((block) => block.blockerId !== user.id);
  const vendorAvailable =
    conversation.vendor.isActive &&
    conversation.vendor.vendorProfile?.applicationStatus === "APPROVED";
  return {
    conversationId,
    participant: getParticipantSummary(conversation, user.id),
    messages: await serializeMessages(refreshed),
    hasOlder: fetched.length > 30,
    nextCursor: fetched.length > 30 ? page[page.length - 1]?.id ?? null : null,
    canSend:
      !blocks.length &&
      vendorAvailable &&
      (user.accountType !== "VENDOR" || vendorAvailable),
    blockedByCurrentUser,
    blockedByOtherParticipant,
  };
}

export async function listShareableProducts(
  user: AuthenticatedUser,
  conversationId: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  if (
    !conversation.vendor.isActive ||
    conversation.vendor.vendorProfile?.applicationStatus !== "APPROVED"
  ) {
    return { products: [] };
  }
  const products = await prisma.product.findMany({
    where: {
      vendorId: conversation.vendorId,
      status: "PUBLISHED",
      vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      nameSo: true,
      variants: {
        where: { isActive: true },
        orderBy: { price: "asc" },
        select: { price: true },
        take: 1,
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true },
        take: 1,
      },
    },
  });
  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      nameSo: product.nameSo,
      price: product.variants[0]?.price.toString() ?? null,
      imageUrl: product.images[0]
        ? `/api/v1/products/images/${product.images[0].id}`
        : null,
    })),
  };
}

export async function listShareableOrders(
  user: AuthenticatedUser,
  conversationId: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  if (user.accountType === "CUSTOMER") {
    const orders = await prisma.vendorOrder.findMany({
      where: {
        vendorId: conversation.vendorId,
        order: { customerId: user.id },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        status: true,
        order: { select: { id: true, orderNumber: true, status: true, createdAt: true } },
      },
    });
    return {
      orders: orders.map((vendorOrder) => ({
        id: vendorOrder.order.id,
        vendorOrderId: vendorOrder.id,
        orderNumber: vendorOrder.order.orderNumber,
        marketplaceStatus: vendorOrder.order.status,
        vendorOrderStatus: vendorOrder.status,
        createdAt: vendorOrder.order.createdAt.toISOString(),
      })),
    };
  }
  const orders = await prisma.vendorOrder.findMany({
    where: {
      vendorId: user.id,
      order: { customerId: conversation.customerId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      order: { select: { id: true, orderNumber: true, status: true, createdAt: true } },
    },
  });
  return {
    orders: orders.map((vendorOrder) => ({
      id: vendorOrder.order.id,
      vendorOrderId: vendorOrder.id,
      orderNumber: vendorOrder.order.orderNumber,
      marketplaceStatus: vendorOrder.order.status,
      vendorOrderStatus: vendorOrder.status,
      createdAt: vendorOrder.order.createdAt.toISOString(),
    })),
  };
}

export async function recordConversationHeartbeat(
  user: AuthenticatedUser,
  conversationId: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const now = new Date();
  await prisma.conversationPresence.upsert({
    where: {
      conversationId_userId: { conversationId, userId: user.id },
    },
    create: { conversationId, userId: user.id, heartbeatAt: now, lastSeenAt: now },
    update: { heartbeatAt: now, lastSeenAt: now },
  });
  const participantId = otherParticipantId(conversation, user.id);
  const state = await prisma.conversationPresence.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: participantId,
      },
    },
    select: { lastSeenAt: true, heartbeatAt: true },
  });
  const age = state ? Date.now() - state.heartbeatAt.getTime() : Infinity;
  return {
    status: getPresenceStatus(age),
    lastSeenAt: state?.lastSeenAt.toISOString() ?? null,
  };
}

export async function updateConversationSocketPresence(
  user: AuthenticatedUser,
  conversationId: string,
  online: boolean,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const now = new Date();
  await prisma.conversationPresence.upsert({
    where: {
      conversationId_userId: { conversationId, userId: user.id },
    },
    create: {
      conversationId,
      userId: user.id,
      heartbeatAt: online ? now : new Date(now.getTime() - 10 * 60_000 - 1),
      lastSeenAt: now,
    },
    update: {
      heartbeatAt: online ? now : new Date(now.getTime() - 10 * 60_000 - 1),
      lastSeenAt: now,
    },
  });
  return {
    conversationId,
    userId: user.id,
    lastSeenAt: now.toISOString(),
    participantId: otherParticipantId(conversation, user.id),
  };
}

export async function markConversationMessagesRead(
  user: AuthenticatedUser,
  conversationId: string,
) {
  await requireConversationParticipant(conversationId, user);
  const readAt = new Date();
  await prisma.conversationMessage.updateMany({
    where: {
      conversationId,
      senderId: { not: user.id },
      readAt: null,
    },
    data: { deliveredAt: readAt, readAt },
  });
  return { conversationId, readerId: user.id, readAt: readAt.toISOString() };
}

export async function getConversationPresence(
  user: AuthenticatedUser,
  conversationId: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const participantId = otherParticipantId(conversation, user.id);
  const state = await prisma.conversationPresence.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: participantId,
      },
    },
    select: { lastSeenAt: true, heartbeatAt: true },
  });
  const age = state ? Date.now() - state.heartbeatAt.getTime() : Infinity;
  return {
    status: getPresenceStatus(age),
    lastSeenAt: state?.lastSeenAt.toISOString() ?? null,
  };
}

export async function createImageMessage(
  user: AuthenticatedUser,
  conversationId: string,
  input: {
    clientMessageId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  },
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const recipientId = await assertCanMessage(conversation, user.id);
  const existing = await prisma.conversationMessage.findUnique({
    where: {
      conversationId_senderId_clientMessageId: {
        conversationId,
        senderId: user.id,
        clientMessageId: input.clientMessageId,
      },
    },
    select: { id: true, type: true },
  });
  if (existing) {
    if (existing.type !== "IMAGE") {
      throw new AppError("IDEMPOTENCY_CONFLICT", 409, "This message identifier was already used.");
    }
    return { message: await getMessage(existing.id, user.id), recipientId, duplicate: true };
  }
  const created = await prisma.$transaction(async (transaction) => {
    const message = await transaction.conversationMessage.create({
      data: {
        conversationId,
        senderId: user.id,
        type: "IMAGE",
        clientMessageId: input.clientMessageId,
        attachments: {
          create: {
            uploadedById: user.id,
            storageKey: input.storageKey,
            originalName: input.originalName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
          },
        },
      },
      select: { id: true },
    });
    await transaction.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    await createNotification(transaction, conversation, user.id, message.id);
    return message;
  });
  return {
    message: await getMessage(created.id, user.id),
    recipientId,
    duplicate: false,
  };
}

export async function getConversationImage(
  user: AuthenticatedUser,
  conversationId: string,
  attachmentId: string,
) {
  await requireConversationParticipant(conversationId, user);
  const attachment = await prisma.conversationAttachment.findFirst({
    where: {
      id: attachmentId,
      message: { conversationId },
    },
    select: { storageKey: true, mimeType: true, originalName: true },
  });
  if (!attachment) throw new AppError("FILE_NOT_FOUND", 404, "File not found.");
  return attachment;
}

export async function blockConversationParticipant(
  user: AuthenticatedUser,
  conversationId: string,
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const blockedId = otherParticipantId(conversation, user.id);
  await prisma.communicationBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId } },
    create: { blockerId: user.id, blockedId, conversationId },
    update: { conversationId },
  });
  return { blockedUserId: blockedId };
}

export async function createCommunicationReport(
  user: AuthenticatedUser,
  conversationId: string,
  input: { reason: CommunicationReportReason; explanation?: string },
) {
  const conversation = await requireConversationParticipant(conversationId, user);
  const reportedUserId = otherParticipantId(conversation, user.id);
  const existing = await prisma.communicationReport.findUnique({
    where: {
      conversationId_reporterId_reportedUserId: {
        conversationId,
        reporterId: user.id,
        reportedUserId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("REPORT_ALREADY_SUBMITTED", 409, "You have already reported this participant in this conversation.");
  }
  const report = await prisma.communicationReport.create({
    data: {
      conversationId,
      reporterId: user.id,
      reportedUserId,
      reason: input.reason,
      explanation: input.explanation?.trim() || null,
    },
    select: { id: true, createdAt: true },
  });
  await prisma.adminNotification.upsert({
    where: { dedupeKey: `communication-report:${report.id}` },
    create: {
      type: "COMMUNICATION_REPORT",
      title: "Communication report submitted",
      titleSo: "Warbixin xiriir ayaa la gudbiyey",
      body: "A buyer–vendor conversation was reported for moderation.",
      bodySo: "Wada sheekaysi iibsade iyo iibiyaha ah ayaa loo gudbiyey kormeer.",
      href: "/admin/communication-reports",
      entityType: "COMMUNICATION_REPORT",
      entityId: report.id,
      dedupeKey: `communication-report:${report.id}`,
    },
    update: {},
  });
  return { reportId: report.id, createdAt: report.createdAt.toISOString() };
}

export async function listCommunicationReports(filters: {
  status?: CommunicationReportStatus;
  reason?: CommunicationReportReason;
  since?: Date;
}) {
  const reports = await prisma.communicationReport.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
      ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      reason: true,
      explanation: true,
      status: true,
      decisionReason: true,
      createdAt: true,
      conversationId: true,
      reporter: { select: { id: true, displayName: true } },
      reportedUser: { select: { id: true, displayName: true, accountType: true } },
      conversation: {
        select: {
          messages: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 100,
            select: {
              id: true,
              senderId: true,
              type: true,
              content: true,
              attachmentData: true,
              createdAt: true,
              attachments: {
                select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
              },
            },
          },
        },
      },
    },
  });
  return {
    reports: reports.map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString(),
      conversation: {
        messages: report.conversation.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    })),
  };
}

export async function reviewCommunicationReport(
  admin: AuthenticatedUser,
  reportId: string,
  input: { status: Exclude<CommunicationReportStatus, "OPEN">; decisionReason: string },
) {
  if (admin.accountType !== "ADMIN") {
    throw new AppError("FORBIDDEN", 403, "Administrator access is required.");
  }
  const report = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.communicationReport.update({
      where: { id: reportId },
      data: {
        status: input.status,
        decisionReason: input.decisionReason.trim(),
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        status: true,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: `COMMUNICATION_REPORT_${input.status}`,
        entityType: "COMMUNICATION_REPORT",
        entityId: reportId,
        metadata: { decisionReason: input.decisionReason.trim() },
      },
    });
    return updated;
  });

  const dedupeKey = `communication-report-review:${report.id}:${report.status}`;
  const notificationData = {
    title: "A communication report was reviewed",
    titleSo: "Warbixinta xiriirka waa la eegay",
    body: "Our moderation team has reviewed your report.",
    bodySo: "Kooxda kormeerku way eegtay warbixintaada.",
    entityType: "COMMUNICATION_REPORT",
    entityId: report.id,
    dedupeKey,
    href: "/customer/messages",
  };
  if (report.reporterId) {
    const reporter = await prisma.user.findUnique({
      where: { id: report.reporterId },
      select: { accountType: true },
    });
    if (reporter?.accountType === "CUSTOMER") {
      await prisma.customerNotification.upsert({
        where: { dedupeKey },
        create: { ...notificationData, customerId: report.reporterId },
        update: {},
      });
    } else if (reporter?.accountType === "VENDOR") {
      await prisma.vendorNotification.upsert({
        where: { dedupeKey },
        create: { ...notificationData, vendorId: report.reporterId },
        update: {},
      });
    }
  }
  return { reportId: report.id, status: report.status };
}

export function communicationReportEnums() {
  return {
    reasons: [
      "SPAM",
      "HARASSMENT",
      "FRAUD",
      "IMPERSONATION",
      "INAPPROPRIATE_CONTENT",
      "OTHER",
    ] satisfies CommunicationReportReason[],
    statuses: ["OPEN", "INVESTIGATING", "DISMISSED", "ACTIONED"] satisfies CommunicationReportStatus[],
  };
}

export function reportDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("INVALID_DATE", 400, "The report date filter is invalid.");
  }
  return date;
}
