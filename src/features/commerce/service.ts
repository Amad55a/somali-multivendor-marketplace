import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import { refundVendorOrder, refundVendorOrderInTransaction } from "@/features/commerce/marketplace-workflow";
import {
  availableStockForVariants,
  availableStockInTransaction,
  expireReservations,
  lockInventoryVariants,
} from "@/features/commerce/inventory";
import { getVendorFinancialStatement, recordDeliveryLedger } from "@/features/commerce/financial-service";
import { bilingualSms, smsOutboxAdapter } from "@/features/commerce/sms-outbox-adapter";

const GUEST_COOKIE = "marketplace_guest_cart";

export function guestCartCookieName() {
  return GUEST_COOKIE;
}

function money(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

export async function resolveCart(user: AuthenticatedUser | null, guestKey: string | null) {
  if (user) {
    let cart = await prisma.shoppingCart.findUnique({ where: { userId: user.id }, include: cartInclude });
    if (!cart) {
      cart = await prisma.shoppingCart.create({ data: { userId: user.id }, include: cartInclude });
    }
    if (guestKey) {
      const guest = await prisma.shoppingCart.findUnique({ where: { guestKey }, include: { items: true } });
      if (guest && guest.id !== cart.id) {
        await prisma.$transaction(async (tx) => {
          for (const cartId of [cart!.id, guest.id].sort()) {
            await tx.$queryRaw`SELECT "id" FROM "shopping_carts" WHERE "id" = ${cartId}::uuid FOR UPDATE`;
          }
          const [currentCart, currentGuest] = await Promise.all([
            tx.shoppingCart.findUnique({ where: { id: cart!.id }, include: { items: true } }),
            tx.shoppingCart.findUnique({ where: { id: guest.id }, include: { items: true } }),
          ]);
          if (!currentCart || !currentGuest) return;
          const variantIds = currentGuest.items.map((item) => item.variantId);
          await lockInventoryVariants(tx, variantIds);
          for (const item of currentGuest.items) {
            const existing = await tx.cartItem.findUnique({
              where: { cartId_variantId: { cartId: currentCart.id, variantId: item.variantId } },
            });
            const quantity = (existing?.quantity ?? 0) + item.quantity;
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
              select: {
                stockQuantity: true,
                isActive: true,
                product: {
                  select: {
                    status: true,
                    vendor: {
                      select: {
                        isActive: true,
                        vendorProfile: { select: { applicationStatus: true } },
                      },
                    },
                  },
                },
              },
            });
            if (
              !variant?.isActive ||
              variant.product.status !== "PUBLISHED" ||
              !variant.product.vendor.isActive ||
              variant.product.vendor.vendorProfile?.applicationStatus !== "APPROVED"
            ) {
              throw new AppError("VARIANT_UNAVAILABLE", 404, "This product variant is not available.");
            }
            const available = await availableStockInTransaction(
              tx,
              item.variantId,
              variant.stockQuantity,
              { exceptCustomerId: user.id },
            );
            if (quantity > available) {
              throw new AppError(
                available === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK",
                409,
                available === 0
                  ? "This variant is out of stock."
                  : `Only ${available} units are available.`,
              );
            }
            if (existing) {
              await tx.cartItem.update({
                where: { id: existing.id },
                data: { quantity },
              });
            } else {
              await tx.cartItem.create({ data: { cartId: currentCart.id, variantId: item.variantId, quantity: item.quantity, capturedPrice: item.capturedPrice } });
            }
          }
          await tx.shoppingCart.delete({ where: { id: currentGuest.id } });
        });
        cart = await prisma.shoppingCart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
      }
    }
    return cart;
  }
  if (!guestKey) return null;
  return prisma.shoppingCart.findUnique({ where: { guestKey }, include: cartInclude });
}

const cartInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { id: true } },
              vendor: { select: { id: true, displayName: true, vendorProfile: { select: { storeName: true, deliveryFee: true } }, deliveryRule: { select: { fee: true } } } },
              category: { select: { name: true, nameSo: true, slug: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ShoppingCartInclude;

export async function serializeCart(cart: Prisma.ShoppingCartGetPayload<{ include: typeof cartInclude }> | null) {
  const items = [];
  const availability = await availableStockForVariants(
    (cart?.items ?? []).map((item) => ({
      id: item.variantId,
      stockQuantity: item.variant.stockQuantity,
    })),
    cart?.userId ? { exceptCustomerId: cart.userId } : {},
  );
  for (const item of cart?.items ?? []) {
    const available = availability.get(item.variantId) ?? 0;
    const price = money(item.variant.price);
    const captured = money(item.capturedPrice);
    const line = new Prisma.Decimal(item.variant.price).mul(item.quantity);
    const fee = item.variant.product.vendor.deliveryRule?.fee ?? item.variant.product.vendor.vendorProfile?.deliveryFee ?? 0;
    items.push({
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      price,
      capturedPrice: captured,
      priceChanged: captured !== "0.00" && captured !== price,
      lineTotal: line.toFixed(2),
      stockQuantity: available,
      sku: item.variant.sku,
      variantName: item.variant.variantName,
      productId: item.variant.product.id,
      name: item.variant.product.name,
      nameSo: item.variant.product.nameSo,
      imageId: item.variant.product.images[0]?.id ?? null,
      storeName: item.variant.product.vendor.vendorProfile?.storeName ?? item.variant.product.vendor.displayName,
      vendorId: item.variant.product.vendor.id,
      deliveryFee: money(fee),
      available: item.variant.isActive && available >= item.quantity && item.variant.product.status === "PUBLISHED",
    });
  }
  const groupsMap = new Map<string, { vendorId: string; storeName: string | null; deliveryFee: string; items: typeof items; subtotal: Prisma.Decimal }>();
  for (const item of items) {
    const current = groupsMap.get(item.vendorId) ?? { vendorId: item.vendorId, storeName: item.storeName, deliveryFee: item.deliveryFee, items: [], subtotal: new Prisma.Decimal(0) };
    current.items.push(item);
    current.subtotal = current.subtotal.add(item.lineTotal);
    groupsMap.set(item.vendorId, current);
  }
  const groups = [...groupsMap.values()].map((group) => ({
    vendorId: group.vendorId,
    storeName: group.storeName,
    deliveryFee: group.deliveryFee,
    items: group.items,
    subtotal: group.subtotal.toFixed(2),
    total: group.subtotal.add(group.deliveryFee).toFixed(2),
  }));
  const subtotal = items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));
  const deliveryTotal = groups.reduce((sum, group) => sum.add(group.deliveryFee), new Prisma.Decimal(0));
  return {
    id: cart?.id ?? null,
    items,
    groups,
    subtotal: subtotal.toFixed(2),
    deliveryTotal: deliveryTotal.toFixed(2),
    discountTotal: "0.00",
    total: subtotal.add(deliveryTotal).toFixed(2),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    hasUnavailable: items.some((item) => !item.available),
    hasPriceChange: items.some((item) => item.priceChanged),
  };
}

export async function addToCart(
  user: AuthenticatedUser | null,
  guestKey: string | null,
  variantId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new AppError("INVALID_QUANTITY", 400, "Quantity must be between 1 and 99.");
  }
  let cart = await resolveCart(user, guestKey);
  if (!cart) {
    cart = await prisma.shoppingCart.create({
      data: user ? { userId: user.id } : { guestKey: guestKey ?? randomBytes(24).toString("hex") },
      include: cartInclude,
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "shopping_carts" WHERE "id" = ${cart.id}::uuid FOR UPDATE`;
    await lockInventoryVariants(tx, [variantId]);
    const variant = await tx.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        product: {
          status: "PUBLISHED",
          vendor: { isActive: true, vendorProfile: { is: { applicationStatus: "APPROVED" } } },
        },
      },
      select: { id: true, stockQuantity: true, price: true },
    });
    if (!variant) throw new AppError("VARIANT_UNAVAILABLE", 404, "This product variant is not available.");
    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    const available = await availableStockInTransaction(
      tx,
      variant.id,
      variant.stockQuantity,
      user ? { exceptCustomerId: user.id } : {},
    );
    if (available < 1) {
      throw new AppError("OUT_OF_STOCK", 409, "This variant is out of stock.");
    }
    if (nextQuantity > available) {
      throw new AppError("INSUFFICIENT_STOCK", 409, `Only ${available} units are available.`);
    }
    if (existing) {
      await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
    } else {
      await tx.cartItem.create({ data: { cartId: cart.id, variantId, quantity, capturedPrice: variant.price } });
    }
  });
  const updated = await prisma.shoppingCart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  return { cart: await serializeCart(updated), guestKey: updated.guestKey };
}

export async function updateCartItem(
  user: AuthenticatedUser | null,
  guestKey: string | null,
  itemId: string,
  quantity: number,
) {
  const cart = await resolveCart(user, guestKey);
  if (!cart) throw new AppError("CART_NOT_FOUND", 404, "Cart was not found.");
  const item = cart.items.find((entry) => entry.id === itemId);
  if (!item) throw new AppError("CART_ITEM_NOT_FOUND", 404, "Cart item was not found.");
  if (quantity === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "shopping_carts" WHERE "id" = ${cart.id}::uuid FOR UPDATE`;
      await tx.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    });
  } else {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new AppError("INVALID_QUANTITY", 400, "Quantity must be between 1 and 99.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "shopping_carts" WHERE "id" = ${cart.id}::uuid FOR UPDATE`;
      await lockInventoryVariants(tx, [item.variantId]);
      const currentItem = await tx.cartItem.findFirst({
        where: { id: itemId, cartId: cart.id },
        include: { variant: { select: { stockQuantity: true, isActive: true, product: { select: { status: true } } } } },
      });
      if (!currentItem) throw new AppError("CART_ITEM_NOT_FOUND", 404, "Cart item was not found.");
      if (!currentItem.variant.isActive || currentItem.variant.product.status !== "PUBLISHED") {
        throw new AppError("VARIANT_UNAVAILABLE", 409, "This product variant is not available.");
      }
      const available = await availableStockInTransaction(
        tx,
        item.variantId,
        currentItem.variant.stockQuantity,
        user ? { exceptCustomerId: user.id } : {},
      );
      if (quantity > available) {
        throw new AppError(
          available === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK",
          409,
          available === 0 ? "This variant is out of stock." : `Only ${available} units are available.`,
        );
      }
      await tx.cartItem.update({ where: { id: itemId }, data: { quantity } });
    });
  }
  const updated = await prisma.shoppingCart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  return { cart: await serializeCart(updated) };
}

export async function clearCart(user: AuthenticatedUser | null, guestKey: string | null) {
  const cart = await resolveCart(user, guestKey);
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  const updated = cart
    ? await prisma.shoppingCart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude })
    : null;
  return { cart: await serializeCart(updated) };
}

export async function getCart(user: AuthenticatedUser | null, guestKey: string | null) {
  await expireReservations();
  return { cart: await serializeCart(await resolveCart(user, guestKey)) };
}

const orderInclude = {
  vendorOrders: {
    include: {
      lines: {
        include: {
          variant: { select: { productId: true, attributes: true } },
          review: { select: { id: true, rating: true, comment: true, photoKey: true, createdAt: true } },
          returns: {
            select: {
              id: true,
              status: true,
              quantity: true,
              reason: true,
              explanation: true,
              photoKey: true,
              vendorNote: true,
              returnInstructions: true,
              adminNote: true,
              disputeResolution: true,
              reviewedByAdminAt: true,
              returnShipmentNote: true,
              createdAt: true,
              disputeUpdates: {
                where: { audience: { in: ["BOTH", "CUSTOMER"] } },
                orderBy: { createdAt: "asc" },
                select: { id: true, authorRole: true, kind: true, content: true, requestedFrom: true, createdAt: true },
              },
              refund: { select: { id: true, amount: true, simulated: true, createdAt: true } },
            },
            orderBy: { createdAt: "desc" as const },
          },
        },
      },
      vendor: {
        select: {
          id: true,
          vendorProfile: {
            select: {
              storeName: true,
              files: { where: { fileType: "STORE_LOGO" }, select: { id: true }, take: 1 },
            },
          },
        },
      },
    },
  },
  payment: true,
  receipt: { select: { id: true, receiptNumber: true, paidAt: true, method: true, maskedMobile: true, amount: true, currency: true } },
} satisfies Prisma.MarketplaceOrderInclude;

function serializeOrder(order: Prisma.MarketplaceOrderGetPayload<{ include: typeof orderInclude }>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMode: order.paymentMode,
    paymentStatus: order.paymentStatus,
    simulated: order.simulated,
    payment: order.payment ? {
      status: order.payment.status,
      method: order.payment.method,
      amount: money(order.payment.amount),
      simulated: order.payment.simulated,
      createdAt: order.payment.createdAt.toISOString(),
    } : null,
    receipt: order.receipt ? {
      id: order.receipt.id,
      receiptNumber: order.receipt.receiptNumber,
      paidAt: order.receipt.paidAt.toISOString(),
      method: order.receipt.method,
      maskedMobile: order.receipt.maskedMobile,
      amount: money(order.receipt.amount),
      currency: order.receipt.currency,
    } : null,
    subtotal: money(order.subtotalAmount),
    total: money(order.totalAmount),
    currency: order.currency,
    contactName: order.contactName,
    email: order.email,
    phone: order.phone,
    country: order.country,
    region: order.region,
    city: order.city,
    district: order.district,
    address: order.address,
    instructions: order.instructions,
    createdAt: order.createdAt.toISOString(),
    vendorOrders: order.vendorOrders.map((vendorOrder) => ({
      id: vendorOrder.id,
      status: vendorOrder.status,
      vendorId: vendorOrder.vendor.id,
      storeName: vendorOrder.vendor.vendorProfile?.storeName ?? null,
      logoFileId: vendorOrder.vendor.vendorProfile?.files[0]?.id ?? null,
      subtotal: money(vendorOrder.subtotalAmount),
      confirmBy: vendorOrder.confirmBy.toISOString(),
      courier: vendorOrder.courier,
      trackingNumber: vendorOrder.trackingNumber,
      deliveryNote: vendorOrder.deliveryNote,
      expectedDelivery: vendorOrder.expectedDelivery?.toISOString() ?? null,
      deliveredAt: vendorOrder.deliveredAt?.toISOString() ?? null,
      lines: vendorOrder.lines.map((line) => ({
        id: line.id,
        productId: line.variant.productId,
        productName: line.productName,
        productNameSo: line.productNameSo,
        variantName: line.variantName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice),
        imageId: line.imageId,
        attributes: line.variant.attributes,
        review: line.review ? {
          id: line.review.id,
          rating: line.review.rating,
          comment: line.review.comment,
          photoKey: line.review.photoKey,
          createdAt: line.review.createdAt.toISOString(),
        } : null,
        returns: line.returns.map((request) => ({
          id: request.id,
          status: request.status,
          quantity: request.quantity,
          reason: request.reason,
          explanation: request.explanation,
          photoKey: request.photoKey,
          vendorNote: request.vendorNote,
          returnInstructions: request.returnInstructions,
          adminNote: request.adminNote,
          disputeResolution: request.disputeResolution,
          reviewedByAdminAt: request.reviewedByAdminAt?.toISOString() ?? null,
          disputeUpdates: request.disputeUpdates.map((update) => ({
            ...update,
            createdAt: update.createdAt.toISOString(),
          })),
          returnShipmentNote: request.returnShipmentNote,
          createdAt: request.createdAt.toISOString(),
          refund: request.refund ? {
            id: request.refund.id,
            amount: money(request.refund.amount),
            simulated: request.refund.simulated,
            createdAt: request.refund.createdAt.toISOString(),
          } : null,
        })),
      })),
    })),
  };
}

export async function listCustomerOrders(user: AuthenticatedUser, search?: string, status?: string) {
  await expireStaleVendorOrders();
  const statuses: Record<string, Prisma.MarketplaceOrderWhereInput> = {
    PENDING: {
      OR: [
        { status: "PENDING_PAYMENT" },
        { vendorOrders: { some: { status: "NEW" } } },
      ],
    },
    PROCESSING: {
      vendorOrders: { some: { status: { in: ["CONFIRMED", "PROCESSING", "PACKED", "READY"] } } },
    },
    SHIPPED: { vendorOrders: { some: { status: "SHIPPED" } } },
    DELIVERED: { vendorOrders: { some: { status: "DELIVERED" } } },
    CANCELLED: {
      OR: [
        { status: "CANCELLED" },
        { vendorOrders: { some: { status: { in: ["CANCELLED", "EXPIRED"] } } } },
      ],
    },
    RETURNS: { returnRequests: { some: { status: { notIn: ["VENDOR_REJECTED", "ADMIN_REJECTED"] } } } },
    REFUNDED: {
      OR: [
        { paymentStatus: "REVERSED" },
        { returnRequests: { some: { status: "REFUNDED" } } },
      ],
    },
  };
  const filters: Prisma.MarketplaceOrderWhereInput[] = [];
  if (status && statuses[status]) filters.push(statuses[status]);
  if (search) {
    filters.push({
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { vendorOrders: { some: { lines: { some: { productName: { contains: search, mode: "insensitive" } } } } } },
        { vendorOrders: { some: { lines: { some: { productNameSo: { contains: search, mode: "insensitive" } } } } } },
      ],
    });
  }
  const orders = await prisma.marketplaceOrder.findMany({
    where: {
      customerId: user.id,
      ...(filters.length ? { AND: filters } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: orderInclude,
  });
  return { orders: orders.map(serializeOrder) };
}

export async function getCustomerOrder(user: AuthenticatedUser, orderId: string) {
  await expireStaleVendorOrders();
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, customerId: user.id },
    include: orderInclude,
  });
  if (!order) throw new AppError("ORDER_NOT_FOUND", 404, "Order was not found.");
  return { order: serializeOrder(order) };
}

export async function confirmCustomerDelivery(user: AuthenticatedUser, vendorOrderId: string) {
  const vendorOrder = await prisma.vendorOrder.findFirst({
    where: { id: vendorOrderId, order: { customerId: user.id }, status: "SHIPPED" },
    include: {
      order: {
        select: {
          orderNumber: true,
          phone: true,
          paymentAttempts: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!vendorOrder) throw new AppError("ORDER_NOT_FOUND", 404, "This order cannot be marked delivered.");
  await prisma.vendorOrder.update({
    where: { id: vendorOrder.id },
    data: { status: "DELIVERED", deliveredAt: new Date(), deliveredBy: "CUSTOMER" },
  });
  await recordDeliveryLedger(vendorOrder.id);
  await smsOutboxAdapter.save(prisma, {
    recipient: vendorOrder.order.phone,
    message: bilingualSms(
      `Delivery confirmed for order ${vendorOrder.order.orderNumber}.`,
      `Gaarsiinta dalabka ${vendorOrder.order.orderNumber} waa la xaqiijiyey.`,
    ),
    messageType: "DELIVERY_CONFIRMATION",
    relatedUserId: user.id,
    orderId: vendorOrder.orderId,
    paymentAttemptId: vendorOrder.order.paymentAttempts[0]?.id,
    idempotencyKey: `SMS:DELIVERY_CONFIRMATION:CUSTOMER:${vendorOrder.id}`,
  });
  return getCustomerOrder(user, vendorOrder.orderId);
}

export async function listVendorOrders(user: AuthenticatedUser, status?: string) {
  await expireStaleVendorOrders();
  const orders = await prisma.vendorOrder.findMany({
    where: { vendorId: user.id, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lines: true,
      order: { select: { orderNumber: true, contactName: true, phone: true, city: true, address: true, createdAt: true, paymentStatus: true, simulated: true } },
    },
  });
  return {
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      orderNumber: order.order.orderNumber,
      customer: order.order.contactName,
      phone: order.order.phone,
      city: order.order.city,
      address: order.order.address,
      createdAt: order.order.createdAt.toISOString(),
      paymentStatus: order.order.paymentStatus,
      simulated: order.order.simulated,
      subtotal: money(order.subtotalAmount),
      confirmBy: order.confirmBy.toISOString(),
      courier: order.courier,
      trackingNumber: order.trackingNumber,
      lines: order.lines.map((line) => ({
        id: line.id,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice),
        imageId: line.imageId,
      })),
    })),
  };
}

const vendorTransitions: Record<string, string[]> = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "PROCESSING"],
  PROCESSING: ["PACKED", "READY", "SHIPPED"],
  PACKED: ["SHIPPED"],
  READY: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
};

export async function updateVendorOrderStatus(
  user: AuthenticatedUser,
  vendorOrderId: string,
  status: string,
  note?: { courier?: string; trackingNumber?: string; deliveryNote?: string },
) {
  await expireStaleVendorOrders();
  const current = await prisma.vendorOrder.findFirst({
    where: { id: vendorOrderId, vendorId: user.id },
    include: {
      order: {
        select: {
          customerId: true,
          orderNumber: true,
          phone: true,
          paymentAttempts: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!current) throw new AppError("ORDER_NOT_FOUND", 404, "Vendor order was not found.");
  const allowed = vendorTransitions[current.status] ?? [];
  if (!allowed.includes(status)) {
    throw new AppError("INVALID_ORDER_TRANSITION", 409, "This order cannot move to that status.");
  }
  const data: Prisma.VendorOrderUpdateInput = { status: status as never };
  if (status === "CONFIRMED") data.confirmedAt = new Date();
  if (status === "PACKED") data.packedAt = new Date();
  if (status === "SHIPPED") {
    data.courier = note?.courier;
    data.trackingNumber = note?.trackingNumber;
    data.deliveryNote = note?.deliveryNote;
  }
  if (status === "DELIVERED") {
    data.deliveredAt = new Date();
    data.deliveredBy = "VENDOR";
  }
  if (status === "CANCELLED" && current.status === "NEW") {
    await restoreVendorOrderStock(current.id);
    await refundVendorOrder(current.id, "VENDOR_CANCELLED");
  }
  await prisma.vendorOrder.update({ where: { id: current.id }, data });
  const customerUpdate: Record<string, { title: string; titleSo: string; body: string; bodySo: string }> = {
    CONFIRMED: {
      title: "Vendor confirmed your order",
      titleSo: "Iibiyuhu wuu xaqiijiyey dalabkaaga",
      body: `The vendor confirmed order ${current.order.orderNumber}.`,
      bodySo: `Iibiyuhu wuxuu xaqiijiyey dalabka ${current.order.orderNumber}.`,
    },
    SHIPPED: {
      title: "Your order has shipped",
      titleSo: "Dalabkaaga waa la soo diray",
      body: `A vendor shipped part of order ${current.order.orderNumber}.`,
      bodySo: `Iibiyuhu wuxuu soo diray qayb ka mid ah dalabka ${current.order.orderNumber}.`,
    },
    DELIVERED: {
      title: "Your order was delivered",
      titleSo: "Dalabkaaga waa la gaarsiiyey",
      body: `A vendor marked part of order ${current.order.orderNumber} as delivered.`,
      bodySo: `Iibiyuhu wuxuu qayb ka mid ah dalabka ${current.order.orderNumber} ku calaamadeeyey in la gaarsiiyey.`,
    },
    CANCELLED: {
      title: "A vendor cancelled your order",
      titleSo: "Iibiyuhu wuu joojiyey dalabkaaga",
      body: `A vendor cancelled part of order ${current.order.orderNumber}.`,
      bodySo: `Iibiyuhu wuxuu joojiyey qayb ka mid ah dalabka ${current.order.orderNumber}.`,
    },
  };
  const customerMessage = customerUpdate[status];
  if (customerMessage) {
    await prisma.customerNotification.create({
      data: {
        customerId: current.order.customerId,
        ...customerMessage,
        entityType: "VendorOrder",
        entityId: current.id,
      },
    });
  }
  const statusSomali: Record<string, string> = {
    CONFIRMED: "waa la xaqiijiyey",
    PROCESSING: "waa la diyaarinayaa",
    PACKED: "waa la baakadeeyey",
    READY: "waa diyaar",
    SHIPPED: "waa la soo diray",
    DELIVERED: "waa la gaarsiiyey",
    CANCELLED: "waa la joojiyey",
  };
  const messageType = status === "SHIPPED"
    ? "SHIPMENT_UPDATE"
    : status === "DELIVERED"
      ? "DELIVERY_CONFIRMATION"
      : "ORDER_STATUS";
  await smsOutboxAdapter.save(prisma, {
    recipient: current.order.phone,
    message: bilingualSms(
      `Order ${current.order.orderNumber} status: ${status}.`,
      `Xaaladda dalabka ${current.order.orderNumber}: ${statusSomali[status] ?? status}.`,
    ),
    messageType,
    relatedUserId: current.order.customerId,
    orderId: current.orderId,
    paymentAttemptId: current.order.paymentAttempts[0]?.id,
    idempotencyKey: `SMS:${messageType}:VENDOR:${current.id}:${status}`,
  });
  if (status === "DELIVERED") await recordDeliveryLedger(current.id);
  return listVendorOrders(user);
}

async function restoreVendorOrderStock(vendorOrderId: string) {
  const lines = await prisma.orderLine.findMany({ where: { vendorOrderId } });
  for (const line of lines) {
    await prisma.productVariant.update({
      where: { id: line.variantId },
      data: { stockQuantity: { increment: line.quantity } },
    });
  }
}

export async function expireStaleVendorOrders() {
  const now = new Date();
  const stale = await prisma.vendorOrder.findMany({
    where: { status: "NEW", confirmBy: { lt: now } },
    select: { id: true },
  });
  for (const order of stale) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.vendorOrder.findUnique({
        where: { id: order.id },
        include: {
          lines: true,
          order: {
            select: {
              id: true,
              customerId: true,
              orderNumber: true,
              phone: true,
              paymentAttempts: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
            },
          },
        },
      });
      if (!current || current.status !== "NEW" || current.confirmBy >= now) return;
      const updated = await tx.vendorOrder.updateMany({
        where: { id: current.id, status: "NEW", confirmBy: { lt: now } },
        data: { status: "EXPIRED" },
      });
      if (updated.count !== 1) return;
      for (const line of current.lines) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stockQuantity: { increment: line.quantity } },
        });
      }
      const refund = await refundVendorOrderInTransaction(tx, current.id, "EXPIRED_UNCONFIRMED");
      if (!refund) throw new AppError("ORDER_NOT_FOUND", 404, "The expired vendor order was not found.");
      await tx.customerNotification.create({
        data: {
          customerId: current.order.customerId,
          title: "Vendor order expired",
          titleSo: "Dalabka iibiyaha wuu dhacay",
          body: "A vendor did not confirm within 24 hours. That portion was cancelled and a simulated refund was recorded.",
          bodySo: "Iibiyuhu ma uusan xaqiijin 24 saacadood gudahood. Qaybtaas waa la joojiyay waxaana la diiwaangeliyay soo celin tijaabo ah.",
          entityType: "VendorOrder",
          entityId: current.id,
          href: `/customer/orders/${current.order.id}`,
        },
      });
      await smsOutboxAdapter.save(tx, {
        recipient: current.order.phone,
        message: bilingualSms(
          `Order ${current.order.orderNumber} expired because the vendor did not confirm. A simulated refund was recorded.`,
          `Dalabka ${current.order.orderNumber} wuu dhacay maadaama iibiyuhu xaqiijin waayey. Soo-celin tijaabo ah ayaa la diiwaangeliyey.`,
        ),
        messageType: "ORDER_STATUS",
        relatedUserId: current.order.customerId,
        orderId: current.order.id,
        paymentAttemptId: current.order.paymentAttempts[0]?.id,
        idempotencyKey: `SMS:ORDER_STATUS:EXPIRED:${current.id}`,
      });
      await tx.auditLog.create({
        data: {
          action: "VENDOR_ORDER_EXPIRED_UNCONFIRMED",
          entityType: "VendorOrder",
          entityId: current.id,
          metadata: { simulatedReversal: true },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

export async function updateVendorStock(user: AuthenticatedUser, variantId: string, stockQuantity: number) {
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    throw new AppError("INVALID_STOCK", 400, "Stock cannot be negative.");
  }
  await prisma.$transaction(async (tx) => {
    await lockInventoryVariants(tx, [variantId]);
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, product: { vendorId: user.id } },
      select: { id: true },
    });
    if (!variant) throw new AppError("VARIANT_NOT_FOUND", 404, "Variant was not found.");
    const held = await tx.stockReservationItem.aggregate({
      where: {
        variantId,
        reservation: { status: "ACTIVE", expiresAt: { gt: new Date() } },
      },
      _sum: { quantity: true },
    });
    const reservedQuantity = held._sum.quantity ?? 0;
    if (stockQuantity < reservedQuantity) {
      throw new AppError(
        "INSUFFICIENT_STOCK",
        409,
        `Stock cannot be reduced below the ${reservedQuantity} units currently reserved.`,
      );
    }
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stockQuantity },
    });
  });
  return { updated: true as const, stockQuantity };
}

export async function listVendorNotifications(user: AuthenticatedUser) {
  const where = {
    vendorId: user.id,
    OR: [{ entityType: null }, { entityType: { not: "CONVERSATION_CALL" } }],
  };
  const [notifications, unreadCount] = await Promise.all([
    prisma.vendorNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.vendorNotification.count({ where: { ...where, readAt: null } }),
  ]);
  return { notifications, unreadCount };
}

export async function listCustomerNotifications(user: AuthenticatedUser) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.customerNotification.findMany({
      where: {
        customerId: user.id,
        OR: [{ entityType: null }, { entityType: { not: "CONVERSATION_CALL" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.customerNotification.count({
      where: {
        customerId: user.id,
        readAt: null,
        OR: [{ entityType: null }, { entityType: { not: "CONVERSATION_CALL" } }],
      },
    }),
  ]);
  return { notifications, unreadCount };
}

export async function markCustomerNotificationsRead(user: AuthenticatedUser, id?: string) {
  await prisma.customerNotification.updateMany({
    where: { customerId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return listCustomerNotifications(user);
}

export async function markVendorNotificationsRead(user: AuthenticatedUser, id?: string) {
  await prisma.vendorNotification.updateMany({
    where: { vendorId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return listVendorNotifications(user);
}

export async function vendorAnalytics(user: AuthenticatedUser) {
  await expireStaleVendorOrders();
  const orders = await prisma.vendorOrder.findMany({
    where: { vendorId: user.id, status: { notIn: ["CANCELLED", "EXPIRED"] }, order: { paymentStatus: "SUCCEEDED" } },
    include: { lines: true },
  });
  const revenue = orders.reduce(
    (sum, order) => sum.add(order.lines.reduce(
      (lineSum, line) => lineSum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
      new Prisma.Decimal(0),
    )),
    new Prisma.Decimal(0),
  );
  const productSales = new Map<string, { name: string; quantity: number; revenue: Prisma.Decimal }>();
  for (const order of orders) {
    for (const line of order.lines) {
      const current = productSales.get(line.productName) ?? { name: line.productName, quantity: 0, revenue: new Prisma.Decimal(0) };
      current.quantity += line.quantity;
      current.revenue = current.revenue.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity));
      productSales.set(line.productName, current);
    }
  }
  const [statusCounts, statement] = await Promise.all([
    prisma.vendorOrder.groupBy({
      by: ["status"],
      where: { vendorId: user.id },
      _count: { _all: true },
    }),
    getVendorFinancialStatement(user.id),
  ]);
  return {
    totalSales: money(revenue),
    totalOrders: orders.length,
    averageOrderValue: orders.length ? revenue.div(orders.length).toFixed(2) : "0.00",
    financialSummary: {
      totalSales: statement.summary.totalSales,
      totalCommission: statement.summary.totalCommission,
      vendorDiscounts: statement.summary.vendorCouponDiscounts,
      totalRefunds: statement.summary.totalRefunds,
      totalAdjustments: statement.summary.totalAdjustments,
      deliveryFees: statement.summary.deliveryFees,
      netEarnings: statement.summary.netEarnings,
      pendingEarnings: statement.summary.pendingEarnings,
      availablePayoutBalance: statement.summary.availablePayoutBalance,
      payoutProcessing: statement.summary.payoutProcessing,
      alreadyPaid: statement.summary.totalAlreadyPaid,
      negativeBalance: statement.summary.negativeBalance,
    },
    topProducts: [...productSales.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((item) => ({ name: item.name, quantity: item.quantity, revenue: money(item.revenue) })),
    statusCounts: statusCounts.map((item) => ({ status: item.status, count: item._count._all })),
  };
}
