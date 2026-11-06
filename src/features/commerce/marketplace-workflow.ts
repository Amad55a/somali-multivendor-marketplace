import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import { assertMockPaymentAdapterConfigured, simulatedPaymentsAllowed } from "@/config/env";
import { mobileMoneyPaymentAdapter } from "@/features/commerce/payment-adapter";
import { bilingualSms, maskMobileNumber, smsOutboxAdapter } from "@/features/commerce/sms-outbox-adapter";
import { findCountry, findRegion, isValidInternationalPhone } from "@/features/vendors/data/location-data";
import {
  commissionForLine,
  resolveCommissionPercent,
} from "@/features/commerce/financial-calculations";
import { recordPaidVendorOrderLedger } from "@/features/commerce/financial-service";

const RESERVATION_MS = 10 * 60 * 1000;

function scopedIdempotencyKey(customerId: string, key: string) {
  return createHash("sha256").update(`${customerId}:${key}`).digest("hex");
}

export function money(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

export async function expireReservations() {
  await prisma.stockReservation.updateMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export async function reservedQuantity(variantId: string, exceptReservationId?: string) {
  await expireReservations();
  const items = await prisma.stockReservationItem.findMany({
    where: {
      variantId,
      reservation: { status: "ACTIVE", expiresAt: { gt: new Date() }, ...(exceptReservationId ? { id: { not: exceptReservationId } } : {}) },
    },
    select: { quantity: true },
  });
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export async function availableStock(variantId: string, physical: number, exceptReservationId?: string) {
  return Math.max(0, physical - await reservedQuantity(variantId, exceptReservationId));
}

function applyDiscount(base: Prisma.Decimal, type: "PERCENTAGE" | "FIXED", value: Prisma.Decimal) {
  if (type === "PERCENTAGE") {
    return Prisma.Decimal.min(base, base.mul(value).div(100));
  }
  return Prisma.Decimal.min(base, value);
}

function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

function validateCouponInput(input: {
  code: string;
  scope: "VENDOR" | "PLATFORM";
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount?: number;
  startsAt: string | Date;
  endsAt: string | Date;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
}) {
  const code = normalizeCouponCode(input.code);
  if (!code || code.length < 3 || code.length > 40) {
    throw new AppError("INVALID_COUPON_CODE", 400, "Coupon codes must be 3-40 characters long.");
  }

  if (input.discountType === "PERCENTAGE") {
    if (!Number.isFinite(input.discountValue) || input.discountValue <= 0 || input.discountValue > 100) {
      throw new AppError("INVALID_COUPON_DISCOUNT", 400, "Percentage coupons must be greater than 0 and no more than 100.");
    }
  } else if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
    throw new AppError("INVALID_COUPON_DISCOUNT", 400, "Fixed-amount coupons must be greater than 0.");
  }

  const minOrderAmount = input.minOrderAmount ?? 0;
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
    throw new AppError("INVALID_COUPON_MINIMUM", 400, "The minimum order amount cannot be negative.");
  }

  const totalUsageLimit = input.totalUsageLimit;
  if (totalUsageLimit !== undefined && (!Number.isInteger(totalUsageLimit) || totalUsageLimit <= 0)) {
    throw new AppError("INVALID_COUPON_LIMIT", 400, "Usage limits must be positive integers.");
  }

  const perCustomerLimit = input.perCustomerLimit ?? 1;
  if (!Number.isInteger(perCustomerLimit) || perCustomerLimit <= 0) {
    throw new AppError("INVALID_COUPON_LIMIT", 400, "Per-customer usage limits must be positive integers.");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new AppError("INVALID_COUPON_PERIOD", 400, "Coupon start and end dates must be valid timestamps.");
  }
  if (startsAt >= endsAt) {
    throw new AppError("INVALID_COUPON_PERIOD", 400, "Coupon start date must be before the end date.");
  }

  return code;
}

export async function startCheckoutReservation(user: AuthenticatedUser, guestKey: string | null) {
  await expireReservations();
  const cart = await prisma.shoppingCart.findFirst({
    where: user.accountType === "CUSTOMER" ? { userId: user.id } : { guestKey: guestKey ?? "" },
    include: {
      items: { include: { variant: { include: { product: { include: { vendor: { include: { vendorProfile: true, deliveryRule: true } }, images: { take: 1, orderBy: { isPrimary: "desc" } }, category: true } } } } } },
    },
  });
  if (!cart || cart.items.length === 0) throw new AppError("CART_EMPTY", 400, "Your cart is empty.");

  const blocked = [];
  for (const item of cart.items) {
    const available = await availableStock(item.variantId, item.variant.stockQuantity);
    if (!item.variant.isActive || item.variant.product.status !== "PUBLISHED" || available < item.quantity) {
      blocked.push({ name: item.variant.product.name, variantName: item.variant.variantName, sku: item.variant.sku });
    }
  }
  if (blocked.length) {
    throw new AppError("RESERVATION_UNAVAILABLE", 409, `Cannot reserve: ${blocked.map((item) => `${item.name} (${item.variantName})`).join(", ")}.`);
  }

  const groupedCart = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const vendorId = item.variant.product.vendor.id;
    groupedCart.set(vendorId, [...(groupedCart.get(vendorId) ?? []), item]);
  }
  return prisma.$transaction(async (tx) => {
    await tx.stockReservation.updateMany({ where: { customerId: user.id, status: "ACTIVE" }, data: { status: "RELEASED" } });
    const prices = new Map<string, Prisma.Decimal>();
    for (const item of cart.items) {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${item.variantId}::uuid FOR UPDATE`;
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.variantId },
        include: { product: { select: { status: true } } },
      });
      if (!variant.isActive || variant.product.status !== "PUBLISHED") {
        throw new AppError("RESERVATION_UNAVAILABLE", 409, `${item.variant.product.name} is no longer available.`);
      }
      const held = await tx.stockReservationItem.aggregate({
        where: { variantId: item.variantId, reservation: { status: "ACTIVE", expiresAt: { gt: new Date() } } },
        _sum: { quantity: true },
      });
      const available = variant.stockQuantity - (held._sum.quantity ?? 0);
      if (available < item.quantity) {
        throw new AppError("RESERVATION_CONFLICT", 409, `${item.variant.product.name} no longer has enough stock.`);
      }
      prices.set(item.variantId, new Prisma.Decimal(variant.price));
    }
    let total = new Prisma.Decimal(0);
    for (const items of groupedCart.values()) {
      total = total.add(items.reduce(
        (sum, item) => sum.add((prices.get(item.variantId) ?? new Prisma.Decimal(0)).mul(item.quantity)),
        new Prisma.Decimal(0),
      ));
      const first = items[0];
      total = total.add(first?.variant.product.vendor.deliveryRule?.fee ?? first?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0);
    }
    const reservation = await tx.stockReservation.create({
      data: {
        customerId: user.id,
        expiresAt: new Date(Date.now() + RESERVATION_MS),
        items: {
          create: cart.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: prices.get(item.variantId)!,
          })),
        },
      },
      include: { items: true },
    });
    return {
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt.toISOString(),
      serverNow: new Date().toISOString(),
      secondsRemaining: Math.floor(RESERVATION_MS / 1000),
      total: money(total),
      currency: "USD",
      groups: [...groupedCart.entries()].map(([vendorId, items]) => {
        const subtotal = items.reduce((sum, item) => sum.add((prices.get(item.variantId) ?? new Prisma.Decimal(0)).mul(item.quantity)), new Prisma.Decimal(0));
        const first = items[0];
        const deliveryFee = new Prisma.Decimal(first?.variant.product.vendor.deliveryRule?.fee ?? first?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0);
        return {
          vendorId,
          storeName: first?.variant.product.vendor.vendorProfile?.storeName ?? first?.variant.product.vendor.displayName,
          subtotal: money(subtotal),
          deliveryFee: money(deliveryFee),
          total: money(subtotal.add(deliveryFee)),
          items: items.map((item) => {
            const price = prices.get(item.variantId) ?? new Prisma.Decimal(0);
            return {
              id: reservation.items.find((reservedItem) => reservedItem.variantId === item.variantId)?.id ?? item.id,
              name: item.variant.product.name,
              nameSo: item.variant.product.nameSo,
              imageId: item.variant.product.images[0]?.id ?? null,
              variantName: item.variant.variantName,
              quantity: item.quantity,
              price: money(price),
              lineTotal: money(price.mul(item.quantity)),
            };
          }),
        };
      }),
    };
  });
}

type PayInput = {
  reservationId: string;
  method: "EVC_PLUS" | "ZAAD" | "EDAHAB";
  phone: string;
  idempotencyKey: string;
  contactName: string;
  checkoutPhone: string;
  country: string;
  region: string;
  city: string;
  district?: string;
  address: string;
  instructions?: string;
  platformCoupon?: string;
  vendorCoupons?: Record<string, string>;
};

export async function quoteCheckoutReservation(
  user: AuthenticatedUser,
  input: { reservationId: string; platformCoupon?: string; vendorCoupons?: Record<string, string> },
) {
  const reservation = await prisma.stockReservation.findFirst({
    where: { id: input.reservationId, customerId: user.id },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { include: { vendor: { include: { vendorProfile: true, deliveryRule: true } } } },
            },
          },
        },
      },
    },
  });
  if (!reservation || reservation.status !== "ACTIVE" || reservation.expiresAt <= new Date()) {
    throw new AppError("RESERVATION_EXPIRED", 409, "The stock reservation has expired. Return to cart and try again.");
  }
  return prisma.$transaction(async (tx) => {
    const grouped = new Map<string, typeof reservation.items>();
    for (const item of reservation.items) {
      const vendorId = item.variant.product.vendor.id;
      grouped.set(vendorId, [...(grouped.get(vendorId) ?? []), item]);
    }
    let merchandise = new Prisma.Decimal(0);
    let deliveryTotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    for (const [vendorId, items] of grouped.entries()) {
      const subtotal = items.reduce((sum, item) => sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)), new Prisma.Decimal(0));
      merchandise = merchandise.add(subtotal);
      const first = items[0];
      deliveryTotal = deliveryTotal.add(first?.variant.product.vendor.deliveryRule?.fee ?? first?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0);
      const vendorCoupon = input.vendorCoupons?.[vendorId];
      if (vendorCoupon) discountTotal = discountTotal.add(await consumeCoupon(tx, user.id, vendorCoupon, "VENDOR", vendorId, subtotal));
    }
    if (input.platformCoupon) {
      discountTotal = discountTotal.add(await consumeCoupon(tx, user.id, input.platformCoupon, "PLATFORM", null, merchandise));
    }
    const total = merchandise.add(deliveryTotal).sub(discountTotal);
    return { total: money(total), currency: "USD" };
  });
}

export async function cancelCheckoutReservation(
  user: AuthenticatedUser,
  input: { reservationId: string; method: PayInput["method"]; idempotencyKey: string },
) {
  assertMockPaymentAdapterConfigured();
  const idempotencyKey = scopedIdempotencyKey(user.id, input.idempotencyKey);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "stock_reservations" WHERE "id" = ${input.reservationId}::uuid FOR UPDATE`;
    const duplicate = await tx.simulatedPaymentAttempt.findFirst({
      where: { customerId: user.id, idempotencyKey },
      include: { order: true, receipt: true },
    });
    if (duplicate) {
      if (duplicate.reservationId !== input.reservationId) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 409, "This payment request key was already used for another checkout.");
      }
      return { attempt: duplicate, order: duplicate.order, receipt: duplicate.receipt };
    }

    const reservation = await tx.stockReservation.findFirst({
      where: { id: input.reservationId, customerId: user.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    vendor: { include: { vendorProfile: true, deliveryRule: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!reservation) throw new AppError("RESERVATION_NOT_FOUND", 404, "Checkout reservation was not found.");
    if (reservation.status === "CONVERTED") {
      throw new AppError("PAYMENT_ALREADY_COMPLETED", 409, "This reservation has already been converted into an order.");
    }

    const grouped = new Map<string, typeof reservation.items>();
    for (const item of reservation.items) {
      const vendorId = item.variant.product.vendor.id;
      grouped.set(vendorId, [...(grouped.get(vendorId) ?? []), item]);
    }
    let amount = new Prisma.Decimal(0);
    for (const [vendorId, items] of grouped) {
      amount = amount.add(items.reduce(
        (sum, item) => sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
        new Prisma.Decimal(0),
      ));
      const first = items[0];
      amount = amount.add(first?.variant.product.vendor.deliveryRule?.fee ?? first?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0);
    }
    const expired = reservation.status !== "ACTIVE" || reservation.expiresAt <= new Date();
    const cancelled = expired ? null : await mobileMoneyPaymentAdapter.cancel();
    const attempt = await tx.simulatedPaymentAttempt.create({
      data: {
        customerId: user.id,
        reservationId: reservation.id,
        method: input.method,
        amount,
        currency: "USD",
        transactionReference: cancelled?.transactionReference,
        status: expired ? "EXPIRED" : "CANCELLED",
        failureReason: expired ? "RESERVATION_EXPIRED" : null,
        provider: "MOCK_MOBILE_MONEY",
        simulated: true,
        idempotencyKey,
        completedAt: new Date(),
      },
    });
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: expired ? "EXPIRED" : "RELEASED" },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: expired ? "SIMULATED_PAYMENT_EXPIRED" : "SIMULATED_PAYMENT_CANCELLED",
        entityType: "SimulatedPaymentAttempt",
        entityId: attempt.id,
        metadata: { reservationId: reservation.id, simulated: true },
      },
    });
    return { attempt, order: null, receipt: null };
  });
  return {
    payment: {
      id: result.attempt.id,
      status: result.attempt.status,
      amount: money(result.attempt.amount),
      currency: result.attempt.currency,
      transactionReference: result.attempt.transactionReference,
      simulated: true,
    },
    order: result.order ? { id: result.order.id, orderNumber: result.order.orderNumber } : null,
    receipt: result.receipt ? { id: result.receipt.id, receiptNumber: result.receipt.receiptNumber } : null,
  };
}

export async function listCustomerPaymentHistory(user: AuthenticatedUser) {
  const attempts = await prisma.simulatedPaymentAttempt.findMany({
    where: { customerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { id: true, orderNumber: true } },
      receipt: { select: { id: true, receiptNumber: true } },
    },
  });
  return {
    payments: attempts.map((attempt) => ({
      id: attempt.id,
      date: attempt.createdAt.toISOString(),
      method: attempt.method,
      phone: attempt.maskedPhone,
      amount: money(attempt.amount),
      currency: attempt.currency,
      status: attempt.status,
      transactionReference: attempt.transactionReference,
      simulated: true,
      orderId: attempt.order?.id ?? null,
      orderNumber: attempt.order?.orderNumber ?? null,
      receiptId: attempt.receipt?.id ?? null,
      receiptNumber: attempt.receipt?.receiptNumber ?? null,
    })),
  };
}

export async function getCustomerPaymentReceipt(user: AuthenticatedUser, orderId: string) {
  const receipt = await prisma.paymentReceipt.findFirst({
    where: { orderId, customerId: user.id, simulated: true },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!receipt) return null;
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    orderNumber: receipt.order.orderNumber,
    customerName: receipt.customerName,
    method: receipt.method,
    maskedMobile: receipt.maskedMobile,
    amount: money(receipt.amount),
    currency: receipt.currency,
    transactionReference: receipt.transactionReference,
    paidAt: receipt.paidAt.toISOString(),
    simulated: receipt.simulated,
  };
}

export async function listAdminSmsOutbox(filters: {
  search?: string;
  messageType?: string;
  status?: "QUEUED" | "SAVED_TO_OUTBOX" | "FAILED_TO_SAVE";
  from?: string;
  to?: string;
}) {
  const messages = await prisma.smsOutboxMessage.findMany({
    where: {
      ...(filters.search ? { recipient: { contains: filters.search } } : {}),
      ...(filters.messageType ? { messageType: filters.messageType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { id: true, orderNumber: true } },
      paymentAttempt: { select: { id: true, status: true, transactionReference: true } },
    },
  });
  return {
    messages: messages.map((message) => ({
      id: message.id,
      recipient: message.recipient,
      message: message.message,
      messageType: message.messageType,
      status: message.status,
      deliveryMode: message.deliveryMode,
      error: message.error,
      createdAt: message.createdAt.toISOString(),
      order: message.order,
      payment: message.paymentAttempt,
    })),
  };
}

export async function getAdminPaymentAttempt(id: string) {
  const attempt = await prisma.simulatedPaymentAttempt.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, email: true, displayName: true } },
      receipt: true,
      order: {
        include: {
          vendorOrders: {
            include: {
              vendor: { select: { id: true, vendorProfile: { select: { storeName: true } } } },
              lines: { select: { productName: true, variantName: true, quantity: true, unitPrice: true } },
            },
          },
        },
      },
    },
  });
  if (!attempt) return null;
  return {
    id: attempt.id,
    status: attempt.status,
    method: attempt.method,
    maskedPhone: attempt.maskedPhone,
    amount: money(attempt.amount),
    currency: attempt.currency,
    transactionReference: attempt.transactionReference,
    provider: attempt.provider,
    simulated: attempt.simulated,
    failureReason: attempt.failureReason,
    createdAt: attempt.createdAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    customer: attempt.customer,
    receipt: attempt.receipt ? {
      id: attempt.receipt.id,
      receiptNumber: attempt.receipt.receiptNumber,
      paidAt: attempt.receipt.paidAt.toISOString(),
    } : null,
    order: attempt.order ? {
      id: attempt.order.id,
      orderNumber: attempt.order.orderNumber,
      status: attempt.order.status,
      paymentStatus: attempt.order.paymentStatus,
      total: money(attempt.order.totalAmount),
      vendorOrders: attempt.order.vendorOrders.map((vendorOrder) => ({
        id: vendorOrder.id,
        storeName: vendorOrder.vendor.vendorProfile?.storeName ?? null,
        status: vendorOrder.status,
        lines: vendorOrder.lines.map((line) => ({
          productName: line.productName,
          variantName: line.variantName,
          quantity: line.quantity,
          unitPrice: money(line.unitPrice),
        })),
      })),
    } : null,
  };
}

export async function paySimulatedMobileMoney(user: AuthenticatedUser, guestKey: string | null, input: PayInput) {
  if (!simulatedPaymentsAllowed()) {
    throw new AppError("SIMULATED_PAYMENTS_DISABLED", 403, "Simulated payment is available only in development or demo mode.");
  }
  assertMockPaymentAdapterConfigured();
  const phone = input.phone.trim();
  if (!/^\+?[0-9\s()-]{7,32}$/.test(phone) || phone.replace(/\D/g, "").length < 7) {
    throw new AppError("INVALID_PAYMENT_PHONE", 400, "Enter a valid mobile-money phone number. Do not enter a PIN or OTP.");
  }
  if (!isValidInternationalPhone(input.checkoutPhone)) {
    throw new AppError("INVALID_DELIVERY_PHONE", 400, "Enter a valid international delivery phone number.");
  }
  const country = findCountry(input.country);
  if (!country) throw new AppError("INVALID_DELIVERY_COUNTRY", 400, "Select a supported delivery country.");
  if (country.name === "Somalia" && input.region !== "Other") {
    const region = findRegion(country.name, input.region);
    if (!region || (input.city !== "Other" && !Object.hasOwn(region.cities, input.city))) {
      throw new AppError("INVALID_DELIVERY_LOCATION", 400, "Select a valid region and city.");
    }
    const districts = region.districts?.[input.city];
    if (districts?.length && input.district && input.district !== "Other" && !districts.includes(input.district)) {
      throw new AppError("INVALID_DELIVERY_LOCATION", 400, "Select a valid district.");
    }
  }
  const idempotencyKey = scopedIdempotencyKey(user.id, input.idempotencyKey);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "stock_reservations" WHERE "id" = ${input.reservationId}::uuid FOR UPDATE`;
    const paymentAttempts = tx.simulatedPaymentAttempt;
    if (!paymentAttempts || typeof paymentAttempts.findFirst !== "function") {
      console.error("[commerce] Active Prisma client is missing the simulatedPaymentAttempt delegate. Regenerate Prisma Client and restart the application.");
      throw new AppError("DATABASE_CLIENT_OUT_OF_DATE", 503, "Checkout is temporarily unavailable. Please try again later.");
    }
    const duplicate = await paymentAttempts.findFirst({
      where: { customerId: user.id, idempotencyKey },
      include: { order: true, receipt: true },
    });
    if (duplicate) {
      if (duplicate.reservationId !== input.reservationId) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 409, "This payment request key was already used for another checkout.");
      }
      return {
        attempt: duplicate,
        order: duplicate.order,
        receipt: duplicate.receipt,
      };
    }

    const reservation = await tx.stockReservation.findFirst({
      where: { id: input.reservationId, customerId: user.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    vendor: { include: { vendorProfile: true, deliveryRule: true } },
                    category: true,
                    images: { take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!reservation) throw new AppError("RESERVATION_NOT_FOUND", 404, "Checkout reservation was not found.");
    const priorSuccess = await paymentAttempts.findFirst({
      where: { reservationId: reservation.id, status: "SIMULATED_SUCCESS" },
      include: { order: true, receipt: true },
    });
    if (priorSuccess) {
      return { attempt: priorSuccess, order: priorSuccess.order, receipt: priorSuccess.receipt };
    }
    if (reservation.status !== "ACTIVE" || reservation.expiresAt <= new Date()) {
      const expired = reservation.status === "EXPIRED" || reservation.expiresAt <= new Date();
      if (reservation.status === "ACTIVE") {
        await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "EXPIRED" } });
      }
      const attempt = await paymentAttempts.create({
        data: {
          customerId: user.id,
          reservationId: reservation.id,
          method: input.method,
          maskedPhone: maskMobileNumber(phone),
          amount: 0,
          status: expired ? "EXPIRED" : "CANCELLED",
          failureReason: expired ? "RESERVATION_EXPIRED" : "RESERVATION_CANCELLED",
          provider: "MOCK_MOBILE_MONEY",
          simulated: true,
          idempotencyKey,
          completedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: { actorUserId: user.id, action: expired ? "SIMULATED_PAYMENT_EXPIRED" : "SIMULATED_PAYMENT_CANCELLED", entityType: "SimulatedPaymentAttempt", entityId: attempt.id, metadata: { reservationId: reservation.id, simulated: true } },
      });
      return { attempt, order: null, receipt: null };
    }

    const cart = await tx.shoppingCart.findFirst({ where: { userId: user.id }, include: { items: true } });
    const grouped = new Map<string, typeof reservation.items>();
    for (const item of reservation.items) {
      const vendorId = item.variant.product.vendor.id;
      grouped.set(vendorId, [...(grouped.get(vendorId) ?? []), item]);
    }

    let merchandise = new Prisma.Decimal(0);
    let deliveryTotal = new Prisma.Decimal(0);
    const vendorDiscounts = new Map<string, Prisma.Decimal>();
    for (const [vendorId, items] of grouped) {
      const subtotal = items.reduce((sum, item) => sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)), new Prisma.Decimal(0));
      merchandise = merchandise.add(subtotal);
      const fee = items[0]?.variant.product.vendor.deliveryRule?.fee ?? items[0]?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0;
      deliveryTotal = deliveryTotal.add(fee);
      const code = input.vendorCoupons?.[vendorId];
      if (code) {
        vendorDiscounts.set(vendorId, await consumeCoupon(tx, user.id, code, "VENDOR", vendorId, subtotal));
      }
    }
    const platformDiscount = input.platformCoupon
      ? await consumeCoupon(tx, user.id, input.platformCoupon, "PLATFORM", null, merchandise)
      : new Prisma.Decimal(0);
    const total = merchandise
      .add(deliveryTotal)
      .sub(platformDiscount)
      .sub([...vendorDiscounts.values()].reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)));
    if (total.lte(0)) throw new AppError("INVALID_PAYMENT_AMOUNT", 409, "The calculated order total is invalid.");

    const pendingAttempt = await paymentAttempts.create({
      data: {
        customerId: user.id,
        reservationId: reservation.id,
        method: input.method,
        maskedPhone: maskMobileNumber(phone),
        amount: total,
        currency: "USD",
        status: "PENDING",
        provider: "MOCK_MOBILE_MONEY",
        simulated: true,
        idempotencyKey,
      },
    });
    const adapterResult = await mobileMoneyPaymentAdapter.initiate({
      method: input.method,
      phone,
      amount: money(total),
      currency: "USD",
    });
    if (!adapterResult.simulated || adapterResult.provider !== "MOCK_MOBILE_MONEY") {
      throw new AppError("PAYMENT_ADAPTER_INVALID_RESULT", 503, "The mock payment adapter returned an invalid result.");
    }
    if (adapterResult.status === "FAILED") {
      const completedAt = new Date();
      const attempt = await paymentAttempts.update({
        where: { id: pendingAttempt.id },
        data: {
          status: "FAILED",
          transactionReference: adapterResult.transactionReference,
          failureReason: adapterResult.failureReason,
          completedAt,
        },
      });
      const reason = "Test payment failed. No money was transferred. You may retry before your stock reservation expires.";
      await smsOutboxAdapter.save(tx, {
        recipient: phone,
        message: bilingualSms(
          `SIMULATED PAYMENT FAILED. No money was transferred. You may retry checkout.`,
          `LACAG-BIXIN TIJAABO AH WAY FASHILANTAY. Lacag lama wareejin. Waad isku dayi kartaa mar kale.`,
        ),
        messageType: "PAYMENT_FAILED",
        relatedUserId: user.id,
        paymentAttemptId: attempt.id,
        idempotencyKey: `SMS:PAYMENT_FAILED:${attempt.id}`,
      });
      await tx.auditLog.create({
        data: { actorUserId: user.id, action: "SIMULATED_MOBILE_MONEY_FAILED", entityType: "SimulatedPaymentAttempt", entityId: attempt.id, metadata: { method: input.method, simulated: true, reason: adapterResult.failureReason } },
      });
      return { attempt, order: null, receipt: null, message: reason };
    }
    if (adapterResult.status !== "SIMULATED_SUCCESS") {
      throw new AppError("PAYMENT_ADAPTER_INVALID_RESULT", 503, "The mock payment adapter returned an unsupported payment state.");
    }

    await tx.$queryRaw`SELECT "id" FROM "commission_settings" WHERE "id" = 'default' FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "category_commissions" FOR SHARE`;
    const commissionSettings = await tx.commissionSettings.findUniqueOrThrow({
      where: { id: "default" },
      select: { defaultPercent: true },
    });
    const commissionCategories = await tx.category.findMany({
      select: {
        id: true,
        parentId: true,
        commission: { select: { percent: true, isActive: true } },
      },
    });

    const orderNumber = `SQ${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;
    const created = await tx.marketplaceOrder.create({
      data: {
        orderNumber,
        customerId: user.id,
        status: "PENDING_PAYMENT",
        contactName: input.contactName,
        email: user.email,
        phone: input.checkoutPhone,
        country: input.country,
        region: input.region,
        city: input.city,
        district: input.district,
        address: input.address,
        instructions: input.instructions,
        subtotalAmount: merchandise,
        deliveryTotal,
        platformDiscount,
        totalAmount: total,
        simulated: true,
        paymentMode: "SIMULATED",
        paymentStatus: "PENDING",
      },
    });

    const vendorOrderIds = new Map<string, string>();
    for (const [vendorId, items] of grouped) {
      const subtotal = items.reduce((sum, item) => sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)), new Prisma.Decimal(0));
      const fee = new Prisma.Decimal(items[0]?.variant.product.vendor.deliveryRule?.fee ?? items[0]?.variant.product.vendor.vendorProfile?.deliveryFee ?? 0);
      const discount = vendorDiscounts.get(vendorId) ?? new Prisma.Decimal(0);
      const vendorOrder = await tx.vendorOrder.create({
        data: {
          orderId: created.id,
          vendorId,
          subtotalAmount: subtotal.add(fee).sub(discount),
          deliveryFee: fee,
          discountAmount: discount,
          confirmBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      vendorOrderIds.set(vendorId, vendorOrder.id);
      for (const item of items) {
        const reserved = await tx.productVariant.updateMany({
          where: { id: item.variantId, stockQuantity: { gte: item.quantity }, isActive: true },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) throw new AppError("INSUFFICIENT_STOCK", 409, "A reserved item no longer has enough stock.");
        const commissionPercent = resolveCommissionPercent(
          item.variant.product.categoryId,
          commissionCategories,
          commissionSettings.defaultPercent,
        );
        await tx.orderLine.create({
          data: {
            vendorOrderId: vendorOrder.id,
            variantId: item.variantId,
            productName: item.variant.product.name,
            productNameSo: item.variant.product.nameSo,
            variantName: item.variant.variantName,
            sku: item.variant.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            imageId: item.variant.product.images[0]?.id ?? null,
            categoryId: item.variant.product.categoryId,
            commissionPercent,
            commissionAmount: commissionForLine(item.unitPrice, item.quantity, commissionPercent),
          },
        });
      }
      await tx.vendorNotification.create({
        data: {
          vendorId,
          title: "New order received",
          titleSo: "Dalab cusub ayaa yimid",
          body: `Order ${orderNumber} needs confirmation within 24 hours.`,
          bodySo: `Dalabka ${orderNumber} waa in 24 saacadood gudahood la xaqiijiyo.`,
          entityType: "VendorOrder",
          entityId: vendorOrder.id,
        },
      });
    }

    if (input.platformCoupon) await finalizeCoupon(tx, user.id, created.id, input.platformCoupon, platformDiscount);
    for (const [vendorId, code] of Object.entries(input.vendorCoupons ?? {})) {
      const vendorOrderId = vendorOrderIds.get(vendorId);
      if (!vendorOrderId) throw new AppError("VENDOR_ORDER_NOT_FOUND", 409, "The vendor coupon could not be attached to its order.");
      await finalizeCoupon(tx, user.id, created.id, code, vendorDiscounts.get(vendorId) ?? new Prisma.Decimal(0), vendorOrderId);
    }

    await tx.marketplaceOrder.update({ where: { id: created.id }, data: { status: "PAID", paymentStatus: "SUCCEEDED" } });
    for (const vendorOrderId of vendorOrderIds.values()) {
      await recordPaidVendorOrderLedger(tx, vendorOrderId);
    }
    await tx.paymentRecord.create({
      data: {
        orderId: created.id,
        mode: "SIMULATED",
        status: "SUCCEEDED",
        simulated: true,
        simulatedOutcome: "SUCCESS",
        method: input.method,
        phone: maskMobileNumber(input.phone),
        idempotencyKey,
        amount: created.totalAmount,
      },
    });
    const completedAt = new Date();
    const attempt = await paymentAttempts.update({
      where: { id: pendingAttempt.id },
      data: {
        orderId: created.id,
        status: "SIMULATED_SUCCESS",
        transactionReference: adapterResult.transactionReference,
        completedAt,
      },
    });
    const receipt = await tx.paymentReceipt.create({
      data: {
        receiptNumber: `SQ-R-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
        orderId: created.id,
        paymentAttemptId: attempt.id,
        customerId: user.id,
        customerName: input.contactName,
        method: input.method,
        maskedMobile: maskMobileNumber(phone),
        amount: created.totalAmount,
        currency: created.currency,
        transactionReference: adapterResult.transactionReference,
        paidAt: completedAt,
        simulated: true,
      },
    });
    await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONVERTED", orderId: created.id } });
    if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.customerNotification.create({
      data: {
        customerId: user.id,
        title: "Order confirmed",
        titleSo: "Dalabka waa la xaqiijiyay",
        body: `Test payment succeeded for ${orderNumber}. No real money was charged.`,
        bodySo: `Lacag-bixinta tijaabada ah ee ${orderNumber} way guulaysatay. Lama qaadin lacag dhab ah.`,
        entityType: "MarketplaceOrder",
        entityId: created.id,
      },
    });
    await smsOutboxAdapter.save(tx, {
      recipient: input.checkoutPhone,
      message: bilingualSms(
        `SIMULATED PAYMENT SUCCESS. Order ${orderNumber} is confirmed. No real money was transferred.`,
        `LACAG-BIXIN TIJAABO AH WAY GUULAYSATAY. Dalabka ${orderNumber} waa la xaqiijiyey. Lacag dhab ah lama wareejin.`,
      ),
      messageType: "PAYMENT_SUCCESS",
      relatedUserId: user.id,
      orderId: created.id,
      paymentAttemptId: attempt.id,
      idempotencyKey: `SMS:PAYMENT_SUCCESS:${attempt.id}`,
    });
    await smsOutboxAdapter.save(tx, {
      recipient: input.checkoutPhone,
      message: bilingualSms(
        `Order ${orderNumber} has been confirmed on Somsuuq.`,
        `Dalabka ${orderNumber} waa laga xaqiijiyey Somsuuq.`,
      ),
      messageType: "ORDER_CONFIRMATION",
      relatedUserId: user.id,
      orderId: created.id,
      paymentAttemptId: attempt.id,
      idempotencyKey: `SMS:ORDER_CONFIRMATION:${created.id}`,
    });
    await tx.auditLog.create({
      data: { actorUserId: user.id, action: "SIMULATED_MOBILE_MONEY_SUCCEEDED", entityType: "SimulatedPaymentAttempt", entityId: attempt.id, metadata: { method: input.method, simulated: true, orderId: created.id, amount: money(created.totalAmount) } },
    });
    return { attempt, order: created, receipt };
  });

  void guestKey;
  return {
    payment: {
      id: result.attempt.id,
      status: result.attempt.status,
      method: result.attempt.method,
      amount: money(result.attempt.amount),
      currency: result.attempt.currency,
      transactionReference: result.attempt.transactionReference,
      simulated: true,
      failureReason: result.attempt.failureReason,
    },
    order: result.order ? {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      total: money(result.order.totalAmount),
      simulated: true,
    } : null,
    receipt: result.receipt ? {
      id: result.receipt.id,
      receiptNumber: result.receipt.receiptNumber,
    } : null,
    ...(result.attempt.status === "FAILED" ? {
      message: "Simulated payment failed. No money was transferred. You may retry before your reservation expires.",
    } : {}),
    ...(result.attempt.status === "EXPIRED" ? {
      message: "Your stock reservation expired. Restart checkout to reserve stock again.",
    } : {}),
  };
}

async function consumeCoupon(
  tx: Prisma.TransactionClient,
  customerId: string,
  code: string,
  scope: "VENDOR" | "PLATFORM",
  vendorId: string | null,
  base: Prisma.Decimal,
) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) throw new AppError("COUPON_INVALID", 400, "That coupon is invalid, expired, or not applicable.");

  const coupon = await tx.coupon.findFirst({
    where: { code: normalizedCode, scope, isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() }, ...(vendorId ? { vendorId } : { vendorId: null }) },
  });
  if (!coupon) throw new AppError("COUPON_INVALID", 400, "That coupon is invalid, expired, or not applicable.");

  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "coupons" WHERE "id" = ${coupon.id}::uuid FOR UPDATE`;
  if (!locked.length) throw new AppError("COUPON_INVALID", 400, "That coupon is invalid, expired, or not applicable.");

  if (base.lt(coupon.minOrderAmount)) throw new AppError("COUPON_MINIMUM", 400, "The order does not meet the coupon minimum.");
  const used = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
  if (coupon.totalUsageLimit && used >= coupon.totalUsageLimit) throw new AppError("COUPON_EXHAUSTED", 409, "This coupon has reached its usage limit.");
  const customerUsed = await tx.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
  if (customerUsed >= coupon.perCustomerLimit) throw new AppError("COUPON_USED", 409, "You have already used this coupon.");
  return applyDiscount(base, coupon.discountType, coupon.discountValue);
}

async function finalizeCoupon(
  tx: Prisma.TransactionClient,
  customerId: string,
  orderId: string,
  code: string,
  amount: Prisma.Decimal,
  vendorOrderId?: string,
) {
  const normalizedCode = normalizeCouponCode(code);
  const coupon = await tx.coupon.findFirst({ where: { code: normalizedCode } });
  if (!coupon || amount.lte(0)) return;

  await tx.couponRedemption.create({
    data: { couponId: coupon.id, customerId, orderId, vendorOrderId, amount },
  });
  if (coupon.scope === "PLATFORM") {
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { currency: true, orderNumber: true },
    });
    await tx.ledgerEntry.create({
      data: {
        orderId,
        couponId: coupon.id,
        type: "PLATFORM_DISCOUNT",
        amount: amount.neg(),
        currency: order.currency,
        description: `Platform-funded coupon ${coupon.code} for order ${order.orderNumber}.`,
        idempotencyKey: `PLATFORM_DISCOUNT:${orderId}:${coupon.id}`,
        simulated: true,
      },
    });
  }
}

export async function refundVendorOrderInTransaction(
  tx: Prisma.TransactionClient,
  vendorOrderId: string,
  reason: string,
) {
  const vendorOrder = await tx.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    include: {
      lines: { select: { unitPrice: true, quantity: true, commissionAmount: true, commissionPercent: true } },
      order: {
        include: {
          payment: true,
          paymentAttempts: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          vendorOrders: {
            include: { lines: { select: { unitPrice: true, quantity: true } } },
          },
        },
      },
    },
  });
  if (!vendorOrder) return null;
  const existing = await tx.simulatedRefund.findFirst({
    where: { vendorOrderId, reason, returnId: null },
  });
  if (existing) return { vendorOrder, refund: existing, created: false };
  const payment = vendorOrder.order.payment;
  if (!payment || !payment.simulated || payment.status !== "SUCCEEDED") {
    throw new AppError("REFUND_NOT_AVAILABLE", 409, "A successful simulated payment is required before a refund.");
  }
  const vendorGross = vendorOrder.lines.reduce(
    (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const orderGross = vendorOrder.order.vendorOrders.reduce(
    (sum, order) => sum.add(order.lines.reduce(
      (lineSum, line) => lineSum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
      new Prisma.Decimal(0),
    )),
    new Prisma.Decimal(0),
  );
  const platformDiscountShare = orderGross.gt(0)
    ? new Prisma.Decimal(vendorOrder.order.platformDiscount).mul(vendorGross).div(orderGross)
    : new Prisma.Decimal(0);
  const amount = new Prisma.Decimal(
    new Prisma.Decimal(vendorOrder.subtotalAmount).sub(platformDiscountShare).toFixed(2),
  );
  if (amount.lte(0)) throw new AppError("REFUND_AMOUNT_INVALID", 409, "The vendor order has no refundable captured amount.");
  const previousRefunds = await tx.simulatedRefund.aggregate({
    where: { orderId: vendorOrder.orderId },
    _sum: { amount: true },
  });
  const totalRefunded = (previousRefunds._sum.amount ?? new Prisma.Decimal(0)).add(amount);
  const capturedAmount = new Prisma.Decimal(payment.amount);
  if (totalRefunded.gt(capturedAmount)) {
    throw new AppError("REFUND_EXCEEDS_CAPTURED_PAYMENT", 409, "This refund would exceed the original captured payment.");
  }
  const refund = await tx.simulatedRefund.create({
    data: {
      orderId: vendorOrder.orderId,
      vendorOrderId,
      amount,
      reason,
      simulated: true,
    },
  });
  if (vendorOrder.lines.some((line) => line.commissionAmount === null || line.commissionPercent === null)) {
    throw new AppError("COMMISSION_SNAPSHOT_MISSING", 409, "This order is missing its original commission snapshot and must be reconciled before posting a refund.");
  }
  const commissionTotal = vendorOrder.lines.reduce(
    (sum, line) => sum.add(line.commissionAmount ?? 0),
    new Prisma.Decimal(0),
  );
  const [originalSale, originalCommission] = await Promise.all([
    tx.ledgerEntry.findUnique({
      where: { idempotencyKey: `SALE:${vendorOrderId}` },
      select: { id: true },
    }),
    tx.ledgerEntry.findUnique({
      where: { idempotencyKey: `COMMISSION:${vendorOrderId}` },
      select: { id: true },
    }),
  ]);
  await tx.ledgerEntry.createMany({
    data: [
      {
        vendorId: vendorOrder.vendorId,
        orderId: vendorOrder.orderId,
        vendorOrderId,
        relatedEntryId: originalSale?.id,
        type: "REFUND",
        amount: new Prisma.Decimal(vendorOrder.subtotalAmount).neg(),
        currency: vendorOrder.order.currency,
        description: `Vendor earnings reversed for cancelled order ${vendorOrder.order.orderNumber}.`,
        idempotencyKey: `REFUND:VENDOR_ORDER:${vendorOrderId}`,
        simulated: true,
      },
      {
        vendorId: vendorOrder.vendorId,
        orderId: vendorOrder.orderId,
        vendorOrderId,
        relatedEntryId: originalCommission?.id,
        type: "COMMISSION",
        amount: commissionTotal,
        currency: vendorOrder.order.currency,
        description: `Commission reversed for cancelled order ${vendorOrder.order.orderNumber} using its original snapshots.`,
        idempotencyKey: `COMMISSION:VENDOR_ORDER_REFUND:${vendorOrderId}`,
        simulated: true,
      },
    ],
    skipDuplicates: true,
  });
  if (totalRefunded.gte(capturedAmount)) {
    await tx.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "REVERSED", simulatedOutcome: "SIMULATED_REFUND" },
    });
    await tx.marketplaceOrder.update({
      where: { id: vendorOrder.orderId },
      data: { paymentStatus: "REVERSED" },
    });
  }
  await smsOutboxAdapter.save(tx, {
    recipient: vendorOrder.order.phone,
    message: bilingualSms(
      `A simulated refund was recorded for order ${vendorOrder.order.orderNumber}. No real money was transferred.`,
      `Soo-celin lacag tijaabo ah ayaa loo diiwaangeliyey dalabka ${vendorOrder.order.orderNumber}. Lacag dhab ah lama wareejin.`,
    ),
    messageType: "REFUND_STATUS",
    relatedUserId: vendorOrder.order.customerId,
    orderId: vendorOrder.orderId,
    paymentAttemptId: vendorOrder.order.paymentAttempts[0]?.id,
    idempotencyKey: `SMS:REFUND_STATUS:${vendorOrderId}:${reason}`,
  });
  return { vendorOrder, refund, created: true };
}

export async function refundVendorOrder(vendorOrderId: string, reason: string) {
  return prisma.$transaction((tx) => refundVendorOrderInTransaction(tx, vendorOrderId, reason), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function createReview(
  user: AuthenticatedUser,
  productId: string,
  orderLineId: string,
  rating: number,
  comment?: string,
  photoKey?: string,
) {
  if (user.accountType !== "CUSTOMER") throw new AppError("FORBIDDEN", 403, "Customers only.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError("INVALID_RATING", 400, "Rating must be between 1 and 5.");
  try {
    return await prisma.$transaction(async (tx) => {
      const line = await tx.orderLine.findFirst({
        where: {
          id: orderLineId,
          variant: { productId },
          vendorOrder: {
            status: "DELIVERED",
            deliveredAt: { not: null },
            order: { customerId: user.id, paymentStatus: "SUCCEEDED" },
          },
          returns: { none: { status: "REFUNDED" } },
        },
      });
      if (!line) throw new AppError("REVIEW_NOT_ELIGIBLE", 403, "You can only review products from your delivered orders.");
      const review = await tx.productReview.create({
        data: { productId, customerId: user.id, orderLineId, rating, comment, photoKey },
      });
      await tx.customerNotification.create({
        data: {
          customerId: user.id,
          title: "Your review was submitted",
          titleSo: "Qiimayntaada waa la gudbiyey",
          body: "Your verified-purchase review is now visible on the product page.",
          bodySo: "Qiimayntaada iibka la xaqiijiyey hadda waxay ka muuqataa bogga alaabta.",
          entityType: "ProductReview",
          entityId: review.id,
          href: `/marketplace/${productId}`,
        },
      });
      return review;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("REVIEW_EXISTS", 409, "You already reviewed this order item.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError("REVIEW_CONFLICT", 409, "The order item changed while your review was being submitted. Please try again.");
    }
    throw error;
  }
}

export async function getProductReviewPhoto(reviewId: string) {
  const review = await prisma.productReview.findFirst({
    where: {
      id: reviewId,
      hiddenAt: null,
      product: { status: "PUBLISHED", vendor: { isActive: true } },
      photoKey: { not: null },
    },
    select: { photoKey: true },
  });
  if (!review?.photoKey) throw new AppError("REVIEW_PHOTO_NOT_FOUND", 404, "Review photo not found.");
  return review.photoKey;
}

export async function getAdminReviewPhoto(admin: AuthenticatedUser, reviewId: string) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin only.");
  const review = await prisma.productReview.findFirst({
    where: { id: reviewId, photoKey: { not: null } },
    select: { photoKey: true },
  });
  if (!review?.photoKey) throw new AppError("REVIEW_PHOTO_NOT_FOUND", 404, "Review photo not found.");
  return review.photoKey;
}

export async function hideReview(admin: AuthenticatedUser, reviewId: string, reason: string) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin only.");
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new AppError("MODERATION_REASON_REQUIRED", 400, "A moderation reason is required.");
  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.update({
      where: { id: reviewId },
      data: { hiddenAt: new Date(), hiddenReason: normalizedReason },
    });
    await tx.auditLog.create({
      data: { actorUserId: admin.id, action: "REVIEW_HIDDEN", entityType: "ProductReview", entityId: reviewId, metadata: { reason: normalizedReason } },
    });
    return review;
  });
}

export async function restoreReview(admin: AuthenticatedUser, reviewId: string, reason: string) {
  if (admin.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin only.");
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new AppError("MODERATION_REASON_REQUIRED", 400, "A moderation reason is required.");
  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.update({
      where: { id: reviewId },
      data: { hiddenAt: null, hiddenReason: null },
    });
    await tx.auditLog.create({
      data: { actorUserId: admin.id, action: "REVIEW_RESTORED", entityType: "ProductReview", entityId: reviewId, metadata: { reason: normalizedReason } },
    });
    return review;
  });
}

export async function listAdminReviews(filters: {
  productId?: string;
  productSearch?: string;
  rating?: number;
  status?: "VISIBLE" | "HIDDEN";
  from?: Date;
  to?: Date;
}) {
  const reviews = await prisma.productReview.findMany({
    where: {
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.productSearch ? {
        product: {
          OR: [
            { name: { contains: filters.productSearch, mode: "insensitive" } },
            { nameSo: { contains: filters.productSearch, mode: "insensitive" } },
          ],
        },
      } : {}),
      ...(filters.rating ? { rating: filters.rating } : {}),
      ...(filters.status === "VISIBLE" ? { hiddenAt: null } : filters.status === "HIDDEN" ? { hiddenAt: { not: null } } : {}),
      ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
    },
    include: {
      product: { select: { id: true, name: true, nameSo: true } },
      customer: { select: { id: true, displayName: true, email: true } },
      orderLine: { select: { id: true, productName: true, productNameSo: true, vendorOrder: { select: { orderId: true, vendorId: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { reviews };
}

export async function listVendorCoupons(vendorId: string) {
  const coupons = await prisma.coupon.findMany({
    where: { vendorId },
    include: { redemptions: { select: { amount: true, createdAt: true, order: { select: { orderNumber: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return {
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      scope: coupon.scope,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      minOrderAmount: coupon.minOrderAmount.toString(),
      totalUsageLimit: coupon.totalUsageLimit,
      perCustomerLimit: coupon.perCustomerLimit,
      startsAt: coupon.startsAt.toISOString(),
      endsAt: coupon.endsAt.toISOString(),
      isActive: coupon.isActive,
      usageCount: coupon.redemptions.length,
      remainingUses: coupon.totalUsageLimit === null ? null : Math.max(coupon.totalUsageLimit - coupon.redemptions.length, 0),
      fundedAmount: coupon.redemptions.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0)).toFixed(2),
      redemptions: coupon.redemptions.map((row) => ({
        amount: row.amount.toString(),
        createdAt: row.createdAt.toISOString(),
        orderNumber: row.order?.orderNumber ?? null,
      })),
    })),
  };
}

export async function listAdminCoupons() {
  const coupons = await prisma.coupon.findMany({
    where: { scope: "PLATFORM" },
    include: { redemptions: { select: { amount: true, createdAt: true, order: { select: { orderNumber: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return {
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      scope: coupon.scope,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      minOrderAmount: coupon.minOrderAmount.toString(),
      totalUsageLimit: coupon.totalUsageLimit,
      perCustomerLimit: coupon.perCustomerLimit,
      startsAt: coupon.startsAt.toISOString(),
      endsAt: coupon.endsAt.toISOString(),
      isActive: coupon.isActive,
      usageCount: coupon.redemptions.length,
      remainingUses: coupon.totalUsageLimit === null ? null : Math.max(coupon.totalUsageLimit - coupon.redemptions.length, 0),
      fundedAmount: coupon.redemptions.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0)).toFixed(2),
      redemptions: coupon.redemptions.map((row) => ({
        amount: row.amount.toString(),
        createdAt: row.createdAt.toISOString(),
        orderNumber: row.order?.orderNumber ?? null,
      })),
    })),
  };
}

export async function upsertCoupon(actor: AuthenticatedUser, input: {
  code: string;
  scope: "VENDOR" | "PLATFORM";
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount?: number;
  startsAt: string;
  endsAt: string;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  isActive?: boolean;
}) {
  if (input.scope === "PLATFORM" && actor.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Only admins can create platform coupons.");
  if (input.scope === "VENDOR" && actor.accountType !== "VENDOR") throw new AppError("FORBIDDEN", 403, "Vendors can only create vendor coupons.");

  const code = validateCouponInput(input);
  const vendorId = input.scope === "VENDOR" ? actor.id : null;
  const existing = await prisma.coupon.findUnique({ where: { code } });

  if (existing && (existing.scope !== input.scope || existing.vendorId !== vendorId)) {
    throw new AppError("COUPON_IN_USE", 409, `Coupon code ${code} is already in use by another coupon.`);
  }

  return prisma.coupon.upsert({
    where: { code },
    update: {
      scope: input.scope,
      vendorId,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderAmount: input.minOrderAmount ?? 0,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      totalUsageLimit: input.totalUsageLimit,
      perCustomerLimit: input.perCustomerLimit ?? 1,
      isActive: input.isActive ?? true,
    },
    create: {
      code,
      scope: input.scope,
      vendorId,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderAmount: input.minOrderAmount ?? 0,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      totalUsageLimit: input.totalUsageLimit,
      perCustomerLimit: input.perCustomerLimit ?? 1,
      isActive: input.isActive ?? true,
    },
  });
}

const activeReturnStatuses = [
  "REQUESTED",
  "VENDOR_APPROVED",
  "RETURN_SHIPPED",
  "ESCALATED",
  "ADMIN_APPROVED",
  "RETURNED",
  "RECEIVED",
  "REFUND_PROCESSING",
  "REFUNDED",
] as const;

function isWithinReturnWindow(deliveredAt: Date, now: Date) {
  const deliveredDay = Date.UTC(deliveredAt.getUTCFullYear(), deliveredAt.getUTCMonth(), deliveredAt.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceDelivery = (currentDay - deliveredDay) / (24 * 60 * 60 * 1000);
  return daysSinceDelivery >= 0 && daysSinceDelivery <= 7;
}

export async function requestReturn(
  user: AuthenticatedUser,
  orderLineId: string,
  reason: string,
  explanation: string,
  quantity = 1,
  photoKey?: string,
) {
  if (user.accountType !== "CUSTOMER") throw new AppError("FORBIDDEN", 403, "Customers only.");
  const allowedReasons = new Set([
    "DAMAGED_PRODUCT",
    "WRONG_PRODUCT",
    "NOT_AS_DESCRIBED",
    "MISSING_PARTS",
    "INCORRECT_VARIANT",
    "OTHER",
  ]);
  if (!allowedReasons.has(reason)) throw new AppError("INVALID_RETURN_REASON", 400, "Select a valid return reason.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new AppError("INVALID_RETURN_QUANTITY", 400, "Return quantity must be at least one.");
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
    const line = await tx.orderLine.findFirst({
      where: {
        id: orderLineId,
        vendorOrder: {
          status: "DELIVERED",
          deliveredAt: { not: null },
          order: { customerId: user.id, paymentStatus: "SUCCEEDED" },
        },
      },
      include: { vendorOrder: { include: { order: { select: { orderNumber: true } } } } },
    });
    if (!line?.vendorOrder.deliveredAt) throw new AppError("RETURN_NOT_ELIGIBLE", 403, "Only delivered items can be returned.");
    if (!isWithinReturnWindow(line.vendorOrder.deliveredAt, now)) {
      throw new AppError("RETURN_WINDOW_CLOSED", 409, "The 7-calendar-day return window has closed.");
    }
    const previous = await tx.returnRequest.aggregate({
      where: { orderLineId, status: { in: [...activeReturnStatuses] } },
      _sum: { quantity: true },
    });
    const reservedQuantity = previous._sum.quantity ?? 0;
    if (reservedQuantity + quantity > line.quantity) {
      throw new AppError("RETURN_QUANTITY_EXCEEDED", 409, "The requested quantity exceeds the quantity not already under return.");
    }
    const outstanding = await tx.returnRequest.count({
      where: {
        orderLineId,
        status: { in: activeReturnStatuses.filter((status) => status !== "REFUNDED") },
      },
    });
    if (outstanding > 0) {
      throw new AppError("RETURN_ALREADY_REQUESTED", 409, "An active return request already exists for this item.");
    }
    const request = await tx.returnRequest.create({
      data: {
        orderId: line.vendorOrder.orderId,
        orderLineId,
        customerId: user.id,
        vendorId: line.vendorOrder.vendorId,
        reason,
        explanation: explanation.trim(),
        quantity,
        photoKey,
      },
    });
    await tx.vendorNotification.create({
      data: {
        vendorId: line.vendorOrder.vendorId,
        title: "A customer requested a return",
        titleSo: "Macmiil ayaa codsaday celin",
        body: `Return request for order ${line.vendorOrder.order.orderNumber} requires your review.`,
        bodySo: `Codsiga celinta dalabka ${line.vendorOrder.order.orderNumber} wuxuu u baahan yahay inaad eegto.`,
        entityType: "ReturnRequest",
        entityId: request.id,
        href: "/vendor/returns",
      },
    });
    await tx.customerNotification.create({
      data: {
        customerId: user.id,
        title: "Your return request was submitted",
        titleSo: "Codsigaaga celinta waa la gudbiyey",
        body: `The vendor was notified about return request for order ${line.vendorOrder.order.orderNumber}.`,
        bodySo: `Iibiyaha waa la ogeysiiyey codsiga celinta dalabka ${line.vendorOrder.order.orderNumber}.`,
        entityType: "ReturnRequest",
        entityId: request.id,
        href: `/customer/orders/${line.vendorOrder.orderId}`,
      },
    });
    return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError("RETURN_REQUEST_CONFLICT", 409, "The item return quantity changed while your request was being submitted. Please try again.");
    }
    throw error;
  }
}

export async function listCustomerReturns(user: AuthenticatedUser) {
  const returns = await prisma.returnRequest.findMany({
    where: { customerId: user.id },
    include: {
      order: { select: { id: true, orderNumber: true } },
      orderLine: { select: { id: true, productName: true, productNameSo: true, variantName: true, unitPrice: true, quantity: true } },
      vendor: { select: { vendorProfile: { select: { storeName: true } } } },
      refund: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return { returns };
}

export async function listVendorReturns(user: AuthenticatedUser) {
  const returns = await prisma.returnRequest.findMany({
    where: { vendorId: user.id },
    include: {
      order: { select: { orderNumber: true, contactName: true, phone: true, city: true } },
      orderLine: {
        select: {
          id: true,
          productName: true,
          productNameSo: true,
          variantName: true,
          unitPrice: true,
          quantity: true,
        },
      },
      refund: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { returns };
}

export async function listAdminReturns(status?: string) {
  const returns = await prisma.returnRequest.findMany({
    where: status ? { status: status as never } : undefined,
    include: {
      order: { select: { id: true, orderNumber: true } },
      customer: { select: { id: true, displayName: true, email: true } },
      vendor: { select: { id: true, vendorProfile: { select: { storeName: true } } } },
      orderLine: {
        select: {
          id: true,
          productName: true,
          productNameSo: true,
          variantName: true,
          unitPrice: true,
          quantity: true,
          vendorOrder: { select: { ledgerEntries: { select: { id: true, type: true, amount: true, idempotencyKey: true, createdAt: true } } } },
        },
      },
      refund: true,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return { returns };
}

export async function getReturnPhoto(user: AuthenticatedUser, returnId: string) {
  const request = await prisma.returnRequest.findFirst({
    where: {
      id: returnId,
      ...(user.accountType === "ADMIN"
        ? {}
        : user.accountType === "VENDOR"
          ? { vendorId: user.id }
          : { customerId: user.id }),
      photoKey: { not: null },
    },
    select: { photoKey: true },
  });
  if (!request?.photoKey) throw new AppError("RETURN_PHOTO_NOT_FOUND", 404, "Return evidence photo not found.");
  return request.photoKey;
}

type ReturnAction = "APPROVE" | "REJECT" | "ESCALATE" | "RETURN_SHIPPED" | "RECEIVE" | "ADMIN_APPROVE" | "ADMIN_REJECT";

export async function reviewReturn(
  user: AuthenticatedUser,
  returnId: string,
  action: ReturnAction,
  note?: string,
  instructions?: string,
) {
  const normalizedNote = note?.trim();
  const normalizedInstructions = instructions?.trim();
  if ((action === "REJECT" || action === "ADMIN_APPROVE" || action === "ADMIN_REJECT") && !normalizedNote) {
    throw new AppError("RETURN_DECISION_REASON_REQUIRED", 400, "A decision explanation is required.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
    const request = await tx.returnRequest.findUnique({
      where: { id: returnId },
      include: {
        orderLine: {
          include: {
            vendorOrder: {
              include: {
                lines: { select: { unitPrice: true, quantity: true } },
                order: {
                  include: {
                    payment: true,
                    vendorOrders: {
                      select: {
                        lines: { select: { unitPrice: true, quantity: true } },
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
    if (!request) throw new AppError("RETURN_NOT_FOUND", 404, "Return request was not found.");
    const orderNumber = request.orderLine.vendorOrder.order.orderNumber;
    const now = new Date();

    if (action === "ESCALATE") {
      if (user.accountType !== "CUSTOMER" || request.customerId !== user.id || request.status !== "VENDOR_REJECTED") {
        throw new AppError("FORBIDDEN", 403, "This return cannot be escalated.");
      }
      const updated = await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: "ESCALATED", escalatedAt: now },
      });
      await tx.adminNotification.create({
        data: {
          type: "RETURN_ESCALATED",
          title: "A customer escalated a rejected return",
          titleSo: "Macmiil ayaa sare u qaaday celin la diiday",
          body: `Return dispute for order ${orderNumber} needs an administrator decision.`,
          bodySo: `Khilaafka celinta dalabka ${orderNumber} wuxuu u baahan yahay go'aan maamule.`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: "/admin/returns",
        },
      });
      await tx.customerNotification.create({
        data: {
          customerId: user.id,
          title: "Your return was escalated",
          titleSo: "Codsigaaga celinta waa la gaarsiiyey maamulka",
          body: `An administrator will review the return dispute for order ${orderNumber}.`,
          bodySo: `Maamule ayaa eegi doona khilaafka celinta dalabka ${orderNumber}.`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: `/customer/orders/${request.orderId}`,
        },
      });
      return updated;
    }

    if (action === "APPROVE" || action === "REJECT") {
      if (user.accountType !== "VENDOR" || request.vendorId !== user.id) throw new AppError("FORBIDDEN", 403, "Vendors can only review their own returns.");
      if (request.status !== "REQUESTED") throw new AppError("INVALID_RETURN_STATE", 409, "This return has already been reviewed.");
      const status = action === "APPROVE" ? "VENDOR_APPROVED" : "VENDOR_REJECTED";
      const updated = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status,
          vendorNote: normalizedNote,
          returnInstructions: action === "APPROVE" ? normalizedInstructions : null,
          reviewedByVendorAt: now,
        },
      });
      await tx.customerNotification.create({
        data: {
          customerId: request.customerId,
          title: action === "APPROVE" ? "Your return was approved" : "Your return was rejected",
          titleSo: action === "APPROVE" ? "Codsigaaga celinta waa la oggolaaday" : "Codsigaaga celinta waa la diiday",
          body: action === "APPROVE"
            ? `The vendor approved the return for order ${orderNumber}${normalizedInstructions ? `. Instructions: ${normalizedInstructions}` : "."}`
            : `The vendor rejected the return for order ${orderNumber}. ${normalizedNote}`,
          bodySo: action === "APPROVE"
            ? `Iibiyuhu wuu oggolaaday celinta dalabka ${orderNumber}${normalizedInstructions ? `. Tilmaamo: ${normalizedInstructions}` : "."}`
            : `Iibiyuhu wuu diiday celinta dalabka ${orderNumber}. ${normalizedNote}`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: `/customer/orders/${request.orderId}`,
        },
      });
      if (action === "APPROVE" && normalizedInstructions) {
        await tx.customerNotification.create({
          data: {
            customerId: request.customerId,
            title: "Return instructions are ready",
            titleSo: "Tilmaamaha celinta waa diyaar",
            body: `The vendor provided instructions for your return on order ${orderNumber}: ${normalizedInstructions}`,
            bodySo: `Iibiyuhu wuxuu bixiyey tilmaamaha celinta dalabka ${orderNumber}: ${normalizedInstructions}`,
            entityType: "ReturnRequest",
            entityId: returnId,
            href: `/customer/orders/${request.orderId}`,
          },
        });
      }
      return updated;
    }

    if (action === "ADMIN_APPROVE" || action === "ADMIN_REJECT") {
      if (user.accountType !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Admin only.");
      if (request.status !== "ESCALATED") throw new AppError("INVALID_RETURN_STATE", 409, "Only escalated returns can be decided here.");
      const status = action === "ADMIN_APPROVE" ? "ADMIN_APPROVED" : "ADMIN_REJECTED";
      const updated = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status,
          adminNote: normalizedNote,
          reviewedByAdminAt: now,
          reviewedByAdminId: user.id,
          ...(action === "ADMIN_APPROVE" && normalizedInstructions ? { returnInstructions: normalizedInstructions } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: status,
          entityType: "ReturnRequest",
          entityId: returnId,
          metadata: { reason: normalizedNote, orderNumber },
        },
      });
      await tx.customerNotification.create({
        data: {
          customerId: request.customerId,
          title: action === "ADMIN_APPROVE" ? "The return dispute was approved" : "The return dispute was rejected",
          titleSo: action === "ADMIN_APPROVE" ? "Khilaafka celinta waa la oggolaaday" : "Khilaafka celinta waa la diiday",
          body: `An administrator decided your return for order ${orderNumber}: ${normalizedNote}`,
          bodySo: `Maamule ayaa go'aan ka gaaray celinta dalabka ${orderNumber}: ${normalizedNote}`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: `/customer/orders/${request.orderId}`,
        },
      });
      await tx.vendorNotification.create({
        data: {
          vendorId: request.vendorId,
          title: "An administrator resolved a return dispute",
          titleSo: "Maamule ayaa xalliyey khilaafka celinta",
          body: `An administrator decided the return for order ${orderNumber}: ${normalizedNote}`,
          bodySo: `Maamule ayaa go'aan ka gaaray celinta dalabka ${orderNumber}: ${normalizedNote}`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: "/vendor/returns",
        },
      });
      return updated;
    }

    if (action === "RETURN_SHIPPED") {
      if (user.accountType !== "CUSTOMER" || request.customerId !== user.id || !["VENDOR_APPROVED", "ADMIN_APPROVED"].includes(request.status)) {
        throw new AppError("FORBIDDEN", 403, "Only the customer can mark an approved return as shipped.");
      }
      const updated = await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: "RETURN_SHIPPED", returnShippedAt: now, returnShipmentNote: normalizedNote },
      });
      await tx.vendorNotification.create({
        data: {
          vendorId: request.vendorId,
          title: "A customer shipped a return",
          titleSo: "Macmiil ayaa soo diray alaab celin ah",
          body: `Return for order ${orderNumber} is on its way to you.`,
          bodySo: `Alaabta celinta dalabka ${orderNumber} ayaa kuu soo socota.`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: "/vendor/returns",
        },
      });
      return updated;
    }

    if (action === "RECEIVE") {
      if (user.accountType !== "VENDOR" || request.vendorId !== user.id) throw new AppError("FORBIDDEN", 403, "Vendors can only confirm their own returns.");
      if (request.status !== "RETURN_SHIPPED") throw new AppError("INVALID_RETURN_STATE", 409, "Only shipped returns can be marked received.");
      const payment = request.orderLine.vendorOrder.order.payment;
      if (!payment || !payment.simulated || payment.status !== "SUCCEEDED") {
        throw new AppError("REFUND_NOT_AVAILABLE", 409, "A successful simulated payment is required before a refund.");
      }
      const currentVendorOrder = request.orderLine.vendorOrder;
      const parentOrder = currentVendorOrder.order;
      const lineGross = new Prisma.Decimal(request.orderLine.unitPrice).mul(request.orderLine.quantity);
      const grossReturned = lineGross.mul(request.quantity).div(request.orderLine.quantity);
      const vendorGross = currentVendorOrder.lines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
        new Prisma.Decimal(0),
      );
      const orderGross = parentOrder.vendorOrders.reduce(
        (sum, vendorOrder) => sum.add(vendorOrder.lines.reduce(
          (lineSum, line) => lineSum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
          new Prisma.Decimal(0),
        )),
        new Prisma.Decimal(0),
      );
      const vendorDiscountShare = vendorGross.gt(0)
        ? new Prisma.Decimal(currentVendorOrder.discountAmount).mul(lineGross).div(vendorGross).mul(request.quantity).div(request.orderLine.quantity)
        : new Prisma.Decimal(0);
      const platformDiscountShare = orderGross.gt(0)
        ? new Prisma.Decimal(parentOrder.platformDiscount).mul(lineGross).div(orderGross).mul(request.quantity).div(request.orderLine.quantity)
        : new Prisma.Decimal(0);
      const amount = new Prisma.Decimal(grossReturned.sub(vendorDiscountShare).sub(platformDiscountShare).toFixed(2));
      const vendorEarningReversal = new Prisma.Decimal(grossReturned.sub(vendorDiscountShare).toFixed(2));
      if (amount.lte(0) || vendorEarningReversal.lte(0)) {
        throw new AppError("REFUND_AMOUNT_INVALID", 409, "The return has no refundable captured product amount.");
      }
      const existingRefunds = await tx.simulatedRefund.aggregate({
        where: { orderId: request.orderId },
        _sum: { amount: true },
      });
      const refundedAmount = existingRefunds._sum.amount ?? new Prisma.Decimal(0);
      const capturedAmount = new Prisma.Decimal(payment.amount);
      if (refundedAmount.add(amount).gt(capturedAmount)) {
        throw new AppError("REFUND_EXCEEDS_CAPTURED_PAYMENT", 409, "This refund would exceed the original captured payment.");
      }
      await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: "REFUND_PROCESSING", receivedAt: now },
      });
      await tx.simulatedRefund.create({
        data: {
          orderId: request.orderId,
          vendorOrderId: request.orderLine.vendorOrderId,
          returnId,
          amount,
          reason: "RETURN",
          simulated: true,
        },
      });
      if (request.orderLine.commissionAmount === null || request.orderLine.commissionPercent === null) {
        throw new AppError("COMMISSION_SNAPSHOT_MISSING", 409, "This order is missing its original commission snapshot and must be reconciled before processing the refund.");
      }
      const commission = new Prisma.Decimal(request.orderLine.commissionAmount)
        .mul(request.quantity)
        .div(request.orderLine.quantity)
        .toDecimalPlaces(2);
      const originalSale = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey: `SALE:${request.orderLine.vendorOrderId}` },
        select: { id: true },
      });
      const originalCommission = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey: `COMMISSION:${request.orderLine.vendorOrderId}` },
        select: { id: true },
      });
      await tx.ledgerEntry.createMany({
        data: [
          {
            vendorId: request.vendorId,
            orderId: request.orderId,
            vendorOrderId: request.orderLine.vendorOrderId,
            orderLineId: request.orderLineId,
            relatedEntryId: originalSale?.id,
            type: "REFUND",
            amount: vendorEarningReversal.neg(),
            currency: parentOrder.currency,
            description: `Vendor earnings reversed for returned order item ${orderNumber}.`,
            idempotencyKey: `REFUND:RETURN:${returnId}`,
            simulated: true,
          },
          {
            vendorId: request.vendorId,
            orderId: request.orderId,
            vendorOrderId: request.orderLine.vendorOrderId,
            orderLineId: request.orderLineId,
            relatedEntryId: originalCommission?.id,
            type: "COMMISSION",
            amount: commission,
            currency: parentOrder.currency,
            description: `Commission reversed for returned order item ${orderNumber} using its original snapshot.`,
            idempotencyKey: `RETURN_COMMISSION:${returnId}`,
            simulated: true,
          },
        ],
        skipDuplicates: true,
      });
      const totalRefunded = refundedAmount.add(amount);
      const fullyRefunded = totalRefunded.gte(capturedAmount);
      if (fullyRefunded) {
        await tx.paymentRecord.update({
          where: { id: payment.id },
          data: { status: "REVERSED", simulatedOutcome: "SIMULATED_REFUND" },
        });
        await tx.marketplaceOrder.update({
          where: { id: request.orderId },
          data: { paymentStatus: "REVERSED" },
        });
      }
      const updated = await tx.returnRequest.update({
        where: { id: returnId },
        data: { status: "REFUNDED", refundProcessedAt: now },
      });
      await tx.customerNotification.create({
        data: {
          customerId: request.customerId,
          title: "The vendor confirmed your return",
          titleSo: "Iibiyuhu wuu xaqiijiyey inuu helay alaabta celinta",
          body: `The vendor confirmed receipt of the returned item for order ${orderNumber}.`,
          bodySo: `Iibiyuhu wuxuu xaqiijiyey inuu helay alaabta celinta ee dalabka ${orderNumber}.`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: `/customer/orders/${request.orderId}`,
        },
      });
      await tx.customerNotification.create({
        data: {
          customerId: request.customerId,
          title: "Your simulated refund was processed",
          titleSo: "Soo-celinta lacagta tijaabada ah waa la diiwaangeliyey",
          body: `A simulated refund of $${amount.toFixed(2)} was recorded for order ${orderNumber}. No real mobile money was transferred.`,
          bodySo: `Soo-celin tijaabo ah oo ah $${amount.toFixed(2)} ayaa loo diiwaangeliyey dalabka ${orderNumber}. Lacag moobayl oo dhab ah lama wareejin.`,
          entityType: "ReturnRequest",
          entityId: returnId,
          href: `/customer/orders/${request.orderId}`,
        },
      });
      return updated;
    }

    throw new AppError("INVALID_RETURN_ACTION", 400, "Unknown return action.");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError("RETURN_CONCURRENT_CHANGE", 409, "The return or payment changed concurrently. Refresh and try again.");
    }
    throw error;
  }
}

export async function adminMarketplaceAnalytics(from?: Date, to?: Date) {
  const where = { createdAt: { gte: from, lte: to } };
  const orders = await prisma.marketplaceOrder.findMany({
    where: { paymentStatus: "SUCCEEDED", status: { not: "CANCELLED" }, ...(from || to ? { createdAt: { gte: from, lte: to } } : {}) },
    select: { createdAt: true, totalAmount: true, platformDiscount: true },
  });
  const salesByDay = new Map<string, Prisma.Decimal>();
  for (const order of orders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    salesByDay.set(day, (salesByDay.get(day) ?? new Prisma.Decimal(0)).add(order.totalAmount));
  }
  const statuses = await prisma.vendorOrder.groupBy({ by: ["status"], _count: { _all: true } });
  const commissions = await prisma.ledgerEntry.aggregate({ where: { type: "COMMISSION", ...(from || to ? where : {}) }, _sum: { amount: true } });
  const refunds = await prisma.simulatedRefund.aggregate({ where: from || to ? { createdAt: { gte: from, lte: to } } : {}, _sum: { amount: true } });
  const payouts = await prisma.vendorPayout.aggregate({ where: from || to ? { createdAt: { gte: from, lte: to } } : {}, _sum: { amount: true } });
  const topVendors = await prisma.vendorOrder.groupBy({
    by: ["vendorId"],
    where: { status: { notIn: ["CANCELLED", "EXPIRED"] }, order: { paymentStatus: "SUCCEEDED" } },
    _sum: { subtotalAmount: true },
    orderBy: { _sum: { subtotalAmount: "desc" } },
    take: 8,
  });
  return {
    salesByDay: [...salesByDay.entries()].map(([day, total]) => ({ day, total: money(total) })),
    orderStatuses: statuses.map((item) => ({ status: item.status, count: item._count._all })),
    commissionEarned: money((commissions._sum.amount ?? new Prisma.Decimal(0)).abs()),
    refundTotals: money(refunds._sum.amount ?? 0),
    payoutTotals: money(payouts._sum.amount ?? 0),
    topVendors: topVendors.map((item) => ({ vendorId: item.vendorId, total: money(item._sum.subtotalAmount ?? 0) })),
    simulated: true,
  };
}

export async function setDeliveryFee(user: AuthenticatedUser, fee: number) {
  if (fee < 0) throw new AppError("INVALID_FEE", 400, "Delivery fee cannot be negative.");
  return prisma.vendorDeliveryRule.upsert({
    where: { vendorId: user.id },
    update: { fee },
    create: { vendorId: user.id, fee },
  });
}
