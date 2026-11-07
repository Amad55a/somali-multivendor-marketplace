import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { AccountType } from "../../../generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { apiSuccessResponse, handleApiRequest } from "@/lib/api/responses";
import {
  assertSameOrigin,
  createValidationError,
  parseJson,
} from "@/lib/api/requests";
import { enforceRateLimit } from "@/features/auth/security";
import { verifyRecaptchaToken } from "@/lib/recaptcha/server";
import {
  getAdminOverview,
  deleteAdminUser,
  listAdminAuditLogs,
  listAdminUsers,
  suspendAdminUser,
} from "@/features/admin/service";
import {
  getCustomerProfile,
  getCustomerProfilePhoto,
  removeCustomerProfilePhoto,
  updateCustomerProfile,
  updateCustomerProfilePhoto,
} from "@/features/customer/service";
import {
  listAdminNotifications,
  markAdminNotificationsRead,
} from "@/features/admin/notifications";
import {
  beginAdminLogin,
  enableAdminMfa,
  setupAdminMfa,
  verifyAdminEmail,
  verifyAdminMfa,
} from "@/features/auth/admin-service";
import { completeAmazonLogin, startAmazonLogin } from "@/features/auth/amazon";
import {
  clearPendingEmailVerificationCookie,
  getPendingEmailVerification,
  setPendingEmailVerificationCookie,
} from "@/features/auth/pending-email-verification";
import {
  authenticatedUserData,
  login,
  logout,
  register,
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
  verifyEmail,
} from "@/features/auth/service";
import {
  clearSessionCookie,
  getOptionalCustomer,
  requireUser,
  setSessionCookie,
} from "@/features/auth/sessions";
import {
  adminChallengeSchema,
  adminAuditLogsQuerySchema,
  adminEmailCodeSchema,
  adminLoginSchema,
  adminMfaEnableSchema,
  adminMfaSetupSchema,
  adminUsersQuerySchema,
  applicationFieldsSchema,
  applicationListQuerySchema,
  applicationPatchSchema,
  approveApplicationSchema,
  customerOrVendorSchema,
  emailAccountSchema,
  loginSchema,
  registrationSchema,
  rejectApplicationSchema,
  requestInformationSchema,
  resetPasswordSchema,
  suspendVendorSchema,
  verifyEmailSchema,
  vendorApplicationStatusSchema,
  vendorApplicationEmailRetrySchema,
  submitProfileChangeSchema,
  profileChangeFieldsSchema,
  reviewProfileChangeSchema,
} from "@/features/auth/validation/schemas";
import {
  productCreateSchema,
  productQuerySchema,
  productUpdateSchema,
} from "@/features/products/validation";
import {
  addProductImage,
  changeProductStatus,
  createProduct,
  deleteProductImage,
  getPublicProduct,
  getProductImage,
  getPublicVendorStoreLogo,
  getVendorProduct,
  listCategories,
  listPublicProducts,
  listVendorProducts,
  updateProduct,
} from "@/features/products/service";
import {
  createDraft,
  getApplication,
  getApplicationStatus,
  getOnboarding,
  listApplications,
  reviewApplication,
  retryVendorApplicationEmail,
  submitApplication,
  suspendVendor,
  updateDraft,
  uploadApplicationFile,
} from "@/features/vendors/service";
import {
  getProfileChangeFile,
  getVendorProfileChange,
  reviewProfileChange,
  saveProfileChangeDraft,
  submitProfileChange,
  uploadProfileChangeFile,
} from "@/features/vendors/profile-change-service";
import { readVendorFile, removeVendorFile, saveProductImage } from "@/lib/media/vendor-files";
import { prisma } from "@/lib/prisma";
import {
  addToCart,
  clearCart,
  confirmCustomerDelivery,
  getCart,
  getCustomerOrder,
  guestCartCookieName,
  listCustomerOrders,
  listCustomerNotifications,
  markCustomerNotificationsRead,
  listVendorNotifications,
  listVendorOrders,
  markVendorNotificationsRead,
  updateCartItem,
  updateVendorOrderStatus,
  updateVendorStock,
  vendorAnalytics,
} from "@/features/commerce/service";
import { createCategory, updateCategory } from "@/features/products/service";
import {
  adminMarketplaceAnalytics,
  cancelCheckoutReservation,
  createReview,
  expireReservations,
  getCustomerPaymentReceipt,
  hideReview,
  getProductReviewPhoto,
  getAdminReviewPhoto,
  getReturnPhoto,
  listAdminReviews,
  listAdminReturns,
  listCustomerReturns,
  listVendorReturns,
  listAdminSmsOutbox,
  listCustomerPaymentHistory,
  paySimulatedMobileMoney,
  quoteCheckoutReservation,
  requestReturn,
  restoreReview,
  reviewReturn,
  listAdminCoupons,
  listVendorCoupons,
  setDeliveryFee,
  startCheckoutReservation,
  upsertCoupon,
} from "@/features/commerce/marketplace-workflow";
import {
  approvePayoutBatch,
  cancelPayoutBatch,
  createWeeklyPayoutBatch,
  getAdminCommissionSettings,
  getFinancialReconciliation,
  getVendorFinancialStatement,
  listAdminPayoutBatches,
  previewPayoutBalances,
  retryFailedVendorPayout,
  updateCategoryCommission,
  updateDefaultCommission,
} from "@/features/commerce/financial-service";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type OpenApiMethod = "get" | "post" | "patch" | "delete";
type Params = Record<string, string>;
type ApiHandler = (request: Request, params: Params) => Promise<Response>;

type ApiRoute = {
  method: HttpMethod;
  path: string;
  tags: string[];
  summary: string;
  permission: string;
  responseStatus: number;
  responseDescription: string;
  responseSchema?: z.ZodType;
  requestBodySchema?: z.ZodType;
  querySchema?: z.ZodObject;
  pathSchema?: z.ZodObject;
  authenticated: boolean;
  handler: ApiHandler;
};

const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  accountType: z.enum(["CUSTOMER", "VENDOR", "ADMIN"]),
  emailVerified: z.boolean(),
});
const customerProfilePatchSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
}).strict();
const applicationSchema = z.object({
  id: z.uuid(),
  applicationStatus: vendorApplicationStatusSchema,
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  businessName: z.string().nullable(),
  storeName: z.string().nullable(),
  businessType: z.string().nullable(),
  description: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  marketAssociation: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
  informationRequest: z.string().nullable(),
  mobileMoneyNumber: z.string().nullable(),
  files: z.array(z.object({
    id: z.uuid(),
    fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
    mimeType: z.string(),
    originalName: z.string(),
    sizeBytes: z.number().int(),
  })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  emailDeliveries: z.array(z.object({
    id: z.uuid(),
    event: z.enum([
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "CHANGES_REQUESTED",
      "PROFILE_CHANGE_SUBMITTED",
      "PROFILE_CHANGE_APPROVED",
      "PROFILE_CHANGE_REJECTED",
    ]),
    recipientEmail: z.email(),
    attemptCount: z.number().int(),
    sentAt: z.iso.datetime().nullable(),
    lastAttemptAt: z.iso.datetime().nullable(),
    lastError: z.string().nullable(),
  })).optional(),
});
const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
  }),
});
const amazonCallbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().optional(),
  error: z.string().optional(),
});
const recaptchaTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .describe("Short-lived Google reCAPTCHA v3 token for the named action.");
const amazonStartCaptchaSchema = z
  .object({
    accountType: customerOrVendorSchema,
    locale: z.enum(["en", "so"]).optional(),
    recaptchaToken: recaptchaTokenSchema,
  })
  .strict();
const registrationCaptchaSchema = registrationSchema.extend({
  recaptchaToken: recaptchaTokenSchema,
});
const loginCaptchaSchema = loginSchema.extend({
  recaptchaToken: recaptchaTokenSchema,
});
const emailAccountCaptchaSchema = emailAccountSchema.extend({
  recaptchaToken: recaptchaTokenSchema,
});
const adminLoginCaptchaSchema = adminLoginSchema.extend({
  recaptchaToken: recaptchaTokenSchema,
});
const captchaOnlySchema = z.object({ recaptchaToken: recaptchaTokenSchema }).strict();
const addCartSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(99).optional(),
}).strict();
const updateCartSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(99),
}).strict();
const vendorOrderStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED", "PROCESSING", "PACKED", "READY", "SHIPPED", "DELIVERED"]),
  courier: z.string().trim().max(160).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  deliveryNote: z.string().trim().max(1000).optional(),
}).strict();
const stockSchema = z.object({ stockQuantity: z.coerce.number().int().min(0).max(2147483647) }).strict();
const paySchema = z.object({
  reservationId: z.uuid(),
  method: z.enum(["EVC_PLUS", "ZAAD", "EDAHAB"]),
  phone: z.string().trim().min(7).max(32).regex(/^\+?[0-9\s()-]+$/),
  idempotencyKey: z.string().trim().min(8).max(80),
  contactName: z.string().trim().min(2).max(160),
  checkoutPhone: z.string().trim().min(7).max(32),
  country: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  district: z.string().trim().max(100).optional(),
  address: z.string().trim().min(3).max(300),
  instructions: z.string().trim().max(1000).optional(),
  platformCoupon: z.string().trim().max(40).optional(),
  vendorCoupons: z.record(z.string(), z.string()).optional(),
  recaptchaToken: recaptchaTokenSchema,
}).strict();
const cancelPaymentSchema = z.object({
  reservationId: z.uuid(),
  method: z.enum(["EVC_PLUS", "ZAAD", "EDAHAB"]),
  idempotencyKey: z.string().trim().min(16).max(80),
}).strict();
const checkoutQuoteSchema = z.object({
  reservationId: z.uuid(),
  platformCoupon: z.string().trim().max(40).optional(),
  vendorCoupons: z.record(z.string(), z.string()).optional(),
}).strict();
const smsOutboxQuerySchema = z.object({
  search: z.string().trim().max(32).optional(),
  messageType: z.string().trim().max(60).optional(),
  status: z.enum(["QUEUED", "SAVED_TO_OUTBOX", "FAILED_TO_SAVE"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).strict();
const customerOrdersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNS", "REFUNDED"]).optional(),
}).strict();
const reviewSchema = z.object({ orderLineId: z.uuid(), rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }).strict();
const reviewModerationQuerySchema = z.object({
  productId: z.uuid().optional(),
  product: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(["VISIBLE", "HIDDEN"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).strict();
const adminReturnsQuerySchema = z.object({
  status: z.enum(["REQUESTED", "VENDOR_APPROVED", "VENDOR_REJECTED", "RETURN_SHIPPED", "ESCALATED", "ADMIN_APPROVED", "ADMIN_REJECTED", "RETURNED", "RECEIVED", "REFUND_PROCESSING", "REFUNDED"]).optional(),
}).strict();
const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  scope: z.enum(["VENDOR", "PLATFORM"]),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.coerce.number(),
  minOrderAmount: z.coerce.number().min(0).optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  totalUsageLimit: z.coerce.number().int().positive().optional(),
  perCustomerLimit: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  const start = new Date(value.startsAt);
  const end = new Date(value.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Coupon start date must be before the end date.", path: ["endsAt"] });
  }

  if (value.discountType === "PERCENTAGE") {
    if (value.discountValue <= 0 || value.discountValue > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percentage discounts must be greater than 0 and no more than 100.", path: ["discountValue"] });
    }
  } else if (value.discountValue <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fixed discounts must be greater than 0.", path: ["discountValue"] });
  }
});
const financialStatementQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  type: z.enum(["SALE", "COMMISSION", "VENDOR_DISCOUNT", "PLATFORM_DISCOUNT", "DELIVERY_FEE", "REFUND", "REFUND_ADJUSTMENT", "PAYOUT", "ADJUSTMENT"]).optional(),
  orderNumber: z.string().trim().max(24).optional(),
  payoutStatus: z.enum(["UNPAID", "PENDING", "APPROVED", "PROCESSING", "SIMULATED_PAID", "FAILED", "CANCELLED"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The start date must be before the end date.", path: ["to"] });
  }
});
const payoutHoldOverrideSchema = z.object({
  holdDays: z.coerce.number().int().min(0).max(7).optional(),
}).strict();
const payoutHoldQuerySchema = z.object({
  holdDays: z.coerce.number().int().min(0).max(7).optional(),
}).strict();
const commissionRuleSchema = z.object({
  categoryId: z.uuid(),
  percent: z.coerce.number().min(0).max(100),
  isActive: z.boolean().default(true),
}).strict();
const defaultCommissionSchema = z.object({
  percent: z.coerce.number().min(0).max(100),
}).strict();
const returnSchema = z.object({
  orderLineId: z.uuid(),
  reason: z.enum(["DAMAGED_PRODUCT", "WRONG_PRODUCT", "NOT_AS_DESCRIBED", "MISSING_PARTS", "INCORRECT_VARIANT", "OTHER"]),
  explanation: z.string().trim().max(2000).optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
}).strict();
const returnActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "ESCALATE", "RETURN_SHIPPED", "RECEIVE", "ADMIN_APPROVE", "ADMIN_REJECT"]),
  note: z.string().trim().max(1000).optional(),
  instructions: z.string().trim().max(1000).optional(),
}).strict();
const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameSo: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(140).optional(),
  description: z.string().trim().max(500).optional(),
  descriptionSo: z.string().trim().max(500).optional(),
  parentId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();
const categoryPatchSchema = categoryWriteSchema.partial();

function envelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

function success(
  status: number,
  description: string,
  schema?: z.ZodType,
) {
  return {
    responseStatus: status,
    responseDescription: description,
    ...(schema ? { responseSchema: schema } : {}),
  };
}

function route(
  method: HttpMethod,
  path: string,
  tags: string[],
  summary: string,
  permission: string,
  response: ReturnType<typeof success>,
  handler: ApiHandler,
  options: Pick<
    ApiRoute,
    "authenticated" | "requestBodySchema" | "querySchema" | "pathSchema"
  > = { authenticated: false },
): ApiRoute {
  return {
    method,
    path,
    tags,
    summary,
    permission,
    ...response,
    ...options,
    handler,
  };
}

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  assertSameOrigin(request);
  return parseJson(request, schema);
}

async function imageForm<T>(request: Request, schema: z.ZodType<T>) {
  assertSameOrigin(request);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 5_500_000) throw new AppError("PAYLOAD_TOO_LARGE", 413, "The image upload is too large.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415, "Expected multipart form data.");
  }
  const form = await request.formData();
  const photoValue = form.get("photo");
  if (photoValue !== null && (!(photoValue instanceof File) || photoValue.size === 0 || photoValue.size > 5 * 1024 * 1024)) {
    throw new AppError("INVALID_FILE", 400, "The image must be smaller than 5 MB.");
  }
  const values = Object.fromEntries(
    [...form.entries()]
      .filter(([key]) => key !== "photo")
      .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw createValidationError(parsed.error);
  return { data: parsed.data, photo: photoValue as File | null };
}

async function amazonStartBody(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (contentType === "application/json") {
    return body(request, amazonStartCaptchaSchema);
  }
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415, "Expected JSON or form data.");
  }

  assertSameOrigin(request);
  const value = await request.text();
  if (new TextEncoder().encode(value).byteLength > 8192) {
    throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request payload is too large.");
  }
  const result = amazonStartCaptchaSchema.safeParse(
    Object.fromEntries(new URLSearchParams(value)),
  );
  if (!result.success) {
    throw createValidationError(result.error);
  }
  return result.data;
}

function query<T>(request: Request, schema: z.ZodType<T>): T {
  const values = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(values);
  if (!result.success) {
    throw createValidationError(result.error);
  }
  return result.data;
}

function uuidParam(params: Params, key: string): string {
  const result = z.uuid().safeParse(params[key]);
  if (!result.success) {
    throw createValidationError(result.error);
  }
  return result.data;
}

function jsonResponse(data: unknown, status = 200): Response {
  return apiSuccessResponse(data, status);
}

async function limit(
  request: Request,
  scope: string,
  identifier: string,
  maximum: number,
  seconds: number,
): Promise<void> {
  await enforceRateLimit(request, scope, identifier, maximum, seconds);
}

async function requireRole(
  request: Request,
  role: AccountType,
  allowAmazonWithoutVerifiedEmail = false,
) {
  const user = await requireUser(request, [role]);
  if (
    !user.emailVerifiedAt &&
    role !== "ADMIN" &&
    !(allowAmazonWithoutVerifiedEmail && user.hasAmazonIdentity)
  ) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email address to continue.");
  }
  return user;
}

const routes: ApiRoute[] = [
  route(
    "GET",
    "/categories",
    ["Marketplace"],
    "List active product categories",
    "Public",
    success(200, "Active product categories.", envelope(z.object({ categories: z.array(z.any()) }))),
    async () => jsonResponse({ categories: await listCategories() }),
  ),
  route(
    "GET",
    "/products",
    ["Marketplace"],
    "Browse published marketplace products",
    "Public",
    success(200, "Published products.", envelope(z.object({ products: z.array(z.any()), nextCursor: z.uuid().nullable() }))),
    async (request) => {
      const filters = query(request, productQuerySchema);
      const products = await listPublicProducts(filters);
      return jsonResponse({ products, nextCursor: products.length === filters.limit ? products.at(-1)?.id ?? null : null });
    },
    { authenticated: false, querySchema: productQuerySchema },
  ),
  route(
    "GET",
    "/products/{productId}",
    ["Marketplace"],
    "Get a published product",
    "Public",
    success(200, "Published product.", envelope(z.object({ product: z.any() }))),
    async (_request, params) => jsonResponse({ product: await getPublicProduct(uuidParam(params, "productId")) }),
    { authenticated: false, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "GET",
    "/products/images/{imageId}",
    ["Marketplace"],
    "Get a published product image",
    "Public",
    success(200, "Product image."),
    async (_request, params) => {
      const image = await getProductImage(uuidParam(params, "imageId"));
      const bytes = await readVendorFile(image.storageKey);
      return new Response(bytes, { headers: { "Content-Type": image.mimeType, "Cache-Control": "public, max-age=3600" } });
    },
    { authenticated: false, pathSchema: z.object({ imageId: z.uuid() }) },
  ),
  route(
    "GET",
    "/reviews/{reviewId}/photo",
    ["Marketplace"],
    "Get a visible product review photo",
    "Public",
    success(200, "Review photo."),
    async (_request, params) => {
      const photoKey = await getProductReviewPhoto(uuidParam(params, "reviewId"));
      const bytes = await readVendorFile(photoKey);
      const mimeType = photoKey.endsWith(".png") ? "image/png" : photoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return new Response(bytes, { headers: { "Content-Type": mimeType, "Cache-Control": "public, max-age=3600" } });
    },
    { authenticated: false, pathSchema: z.object({ reviewId: z.uuid() }) },
  ),
  route(
    "GET",
    "/returns/{returnId}/photo",
    ["Marketplace"],
    "Read return evidence for its customer, vendor or an administrator",
    "Authenticated return owner, vendor or ADMIN",
    success(200, "Return evidence photo."),
    async (request, params) => {
      const photoKey = await getReturnPhoto(await requireUser(request), uuidParam(params, "returnId"));
      const bytes = await readVendorFile(photoKey);
      const mimeType = photoKey.endsWith(".png") ? "image/png" : photoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return new Response(bytes, { headers: { "Content-Type": mimeType, "Cache-Control": "private, no-store" } });
    },
    { authenticated: true, pathSchema: z.object({ returnId: z.uuid() }) },
  ),
  route(
    "GET",
    "/admin/reviews/{reviewId}/photo",
    ["Admin"],
    "Read review evidence for moderation",
    "Authenticated ADMIN",
    success(200, "Review photo."),
    async (request, params) => {
      const photoKey = await getAdminReviewPhoto(await requireRole(request, "ADMIN"), uuidParam(params, "reviewId"));
      const bytes = await readVendorFile(photoKey);
      const mimeType = photoKey.endsWith(".png") ? "image/png" : photoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return new Response(bytes, { headers: { "Content-Type": mimeType, "Cache-Control": "private, no-store" } });
    },
    { authenticated: true, pathSchema: z.object({ reviewId: z.uuid() }) },
  ),
  route(
    "GET",
    "/vendors/{vendorId}/logo",
    ["Marketplace"],
    "Get the public logo for an approved vendor",
    "Public",
    success(200, "Vendor store logo."),
    async (_request, params) => {
      const logo = await getPublicVendorStoreLogo(uuidParam(params, "vendorId"));
      return new Response(await readVendorFile(logo.storageKey), {
        headers: { "Content-Type": logo.mimeType, "Cache-Control": "public, max-age=3600" },
      });
    },
    { authenticated: false, pathSchema: z.object({ vendorId: z.uuid() }) },
  ),
  route(
    "GET",
    "/vendor/products",
    ["Vendor"],
    "List the authenticated vendor's products",
    "Authenticated approved VENDOR",
    success(200, "Vendor products.", envelope(z.object({ products: z.array(z.any()), nextCursor: z.uuid().nullable() }))),
    async (request) => {
      const user = await requireRole(request, "VENDOR", true);
      const filters = query(request, productQuerySchema);
      const products = await listVendorProducts(user, filters);
      return jsonResponse({ products, nextCursor: products.length === filters.limit ? products.at(-1)?.id ?? null : null });
    },
    { authenticated: true, querySchema: productQuerySchema },
  ),
  route(
    "POST",
    "/vendor/products",
    ["Vendor"],
    "Create a product",
    "Authenticated approved VENDOR",
    success(201, "Product created.", envelope(z.object({ product: z.any() }))),
    async (request) => jsonResponse({ product: await createProduct(await requireRole(request, "VENDOR", true), await body(request, productCreateSchema)) }, 201),
    { authenticated: true, requestBodySchema: productCreateSchema },
  ),
  route(
    "GET",
    "/vendor/products/{productId}",
    ["Vendor"],
    "Get the authenticated vendor's product",
    "Authenticated approved VENDOR",
    success(200, "Vendor product.", envelope(z.object({ product: z.any() }))),
    async (request, params) => {
      const user = await requireRole(request, "VENDOR", true);
      return jsonResponse({ product: await getVendorProduct(user, uuidParam(params, "productId")) });
    },
    { authenticated: true, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "PATCH",
    "/vendor/products/{productId}",
    ["Vendor"],
    "Update the authenticated vendor's product",
    "Authenticated approved VENDOR",
    success(200, "Product updated.", envelope(z.object({ product: z.any() }))),
    async (request, params) => jsonResponse({ product: await updateProduct(await requireRole(request, "VENDOR", true), uuidParam(params, "productId"), await body(request, productUpdateSchema)) }),
    { authenticated: true, requestBodySchema: productUpdateSchema, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "POST",
    "/vendor/products/{productId}/publish",
    ["Vendor"],
    "Publish a product",
    "Authenticated approved VENDOR",
    success(200, "Product published.", envelope(z.object({ product: z.any() }))),
    async (request, params) => jsonResponse({ product: await changeProductStatus(await requireRole(request, "VENDOR", true), uuidParam(params, "productId"), "PUBLISHED") }),
    { authenticated: true, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "POST",
    "/vendor/products/{productId}/archive",
    ["Vendor"],
    "Archive a product",
    "Authenticated approved VENDOR",
    success(200, "Product archived.", envelope(z.object({ product: z.any() }))),
    async (request, params) => jsonResponse({ product: await changeProductStatus(await requireRole(request, "VENDOR", true), uuidParam(params, "productId"), "ARCHIVED") }),
    { authenticated: true, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "POST",
    "/vendor/products/{productId}/images",
    ["Vendor"],
    "Upload a product image",
    "Authenticated approved VENDOR; multipart image upload",
    success(201, "Product image uploaded.", envelope(z.object({ image: z.any() }))),
    async (request, params) => {
      assertSameOrigin(request);
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", 400, "A product image file is required.");
      return jsonResponse({ image: await addProductImage(await requireRole(request, "VENDOR", true), uuidParam(params, "productId"), file) }, 201);
    },
    { authenticated: true, pathSchema: z.object({ productId: z.uuid() }) },
  ),
  route(
    "DELETE",
    "/vendor/products/{productId}/images/{imageId}",
    ["Vendor"],
    "Delete a product image",
    "Authenticated approved VENDOR",
    success(200, "Product image deleted.", envelope(z.object({ deleted: z.literal(true) }))),
    async (request, params) => {
      assertSameOrigin(request);
      return jsonResponse(await deleteProductImage(await requireRole(request, "VENDOR", true), uuidParam(params, "productId"), uuidParam(params, "imageId")));
    },
    { authenticated: true, pathSchema: z.object({ productId: z.uuid(), imageId: z.uuid() }) },
  ),
  route(
    "POST",
    "/auth/customer/register",
    ["Authentication", "Customer"],
    "Register a customer account",
    "Public; rate limited",
    success(201, "Customer account created; email verification is required. Sets a short-lived HttpOnly registration-verification cookie.", envelope(z.object({
      user: userSchema,
    }))),
    async (request) => {
      const { recaptchaToken, ...input } = await body(request, registrationCaptchaSchema);
      await limit(request, "customer-register", input.email, 5, 3600);
      await verifyRecaptchaToken(recaptchaToken, "customer_register");
      const result = await register("CUSTOMER", input.email, input.password);
      return setPendingEmailVerificationCookie(
        jsonResponse(result, 201),
        result.user.id,
        "CUSTOMER",
      );
    },
    { authenticated: false, requestBodySchema: registrationCaptchaSchema },
  ),
  route(
    "POST",
    "/auth/vendor/register",
    ["Authentication", "Vendor Onboarding"],
    "Register a vendor account",
    "Public; rate limited",
    success(201, "Vendor account created; email verification is required. Sets a short-lived HttpOnly registration-verification cookie.", envelope(z.object({
      user: userSchema,
    }))),
    async (request) => {
      const { recaptchaToken, ...input } = await body(request, registrationCaptchaSchema);
      await limit(request, "vendor-register", input.email, 5, 3600);
      await verifyRecaptchaToken(recaptchaToken, "vendor_register");
      const result = await register("VENDOR", input.email, input.password);
      return setPendingEmailVerificationCookie(
        jsonResponse(result, 201),
        result.user.id,
        "VENDOR",
      );
    },
    { authenticated: false, requestBodySchema: registrationCaptchaSchema },
  ),
  route(
    "POST",
    "/auth/login",
    ["Authentication"],
    "Sign in a customer or vendor",
    "Public; accepts CUSTOMER or VENDOR only",
    success(200, "Authenticated user; session is set as an HttpOnly cookie.", envelope(z.object({
      user: userSchema,
    }))),
    async (request) => {
      const { recaptchaToken, ...input } = await body(request, loginCaptchaSchema);
      await limit(request, "login", input.email, 10, 900);
      await verifyRecaptchaToken(recaptchaToken, `${input.accountType.toLowerCase()}_login`);
      const result = await login(input.email, input.password, input.accountType);
      return setSessionCookie(jsonResponse({ user: result.user }), result.session);
    },
    { authenticated: false, requestBodySchema: loginCaptchaSchema },
  ),
  route(
    "POST",
    "/auth/logout",
    ["Authentication"],
    "Revoke the current session",
    "Authenticated customer, vendor, or admin; same-origin request required",
    success(200, "Session revoked and cookie cleared.", envelope(z.object({
      loggedOut: z.literal(true),
    }))),
    async (request) => {
      assertSameOrigin(request);
      const user = await requireUser(request);
      await logout(request, user);
      return clearSessionCookie(jsonResponse({ loggedOut: true }));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/auth/me",
    ["Authentication", "Customer"],
    "Get the current customer or vendor",
    "Authenticated customer or vendor",
    success(200, "Current account and vendor status.", envelope(z.object({
      user: userSchema,
      vendorStatus: z.string().optional(),
      vendorVerificationStatus: z.string().optional(),
    }))),
    async (request) => {
      const user = await requireUser(request, ["CUSTOMER", "VENDOR"]);
      if (!user.emailVerifiedAt && !user.hasAmazonIdentity) {
        throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email address to continue.");
      }
      return jsonResponse(await authenticatedUserData(user));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/auth/me",
    ["Admin"],
    "Get the current administrator",
    "Authenticated ADMIN; returns safe profile and authentication state only",
    success(200, "Current administrator profile and authentication state.", envelope(z.object({
      user: userSchema,
      vendorStatus: z.string().optional(),
      vendorVerificationStatus: z.string().optional(),
    }))),
    async (request) =>
      authenticatedUserData(await requireRole(request, "ADMIN")).then(jsonResponse),
    { authenticated: true },
  ),
  route(
    "POST",
    "/auth/email/verify",
    ["Authentication"],
    "Verify an email address",
    "Public; requires the short-lived HttpOnly verification cookie; rate limited",
    success(200, "Email verified; an authenticated session is set as an HttpOnly cookie.", envelope(z.object({
      verified: z.literal(true),
      user: z.object({
        id: z.uuid(),
        accountType: customerOrVendorSchema,
      }),
    }))),
    async (request) => {
      const input = await body(request, verifyEmailSchema);
      const pending = getPendingEmailVerification(request);
      if (!pending) {
        throw new AppError(
          "EMAIL_VERIFICATION_SESSION_REQUIRED",
          401,
          "This email verification request is no longer available. Please register again.",
        );
      }
      await limit(request, "email-verify", pending.userId, 5, 600);
      const result = await verifyEmail(
        pending.userId,
        pending.accountType,
        input.code,
      );
      const response = clearPendingEmailVerificationCookie(
        jsonResponse({ verified: true, user: result.user }),
      );
      return setSessionCookie(response, result.session);
    },
    { authenticated: false, requestBodySchema: verifyEmailSchema },
  ),
  route(
    "POST",
    "/auth/email/resend",
    ["Authentication"],
    "Resend an email verification code",
    "Public; requires the short-lived HttpOnly verification cookie; rate limited",
    success(202, "A new code was sent to the registered email address.", envelope(z.object({ accepted: z.literal(true) }))),
    async (request) => {
      const input = await body(request, captchaOnlySchema);
      const pending = getPendingEmailVerification(request);
      if (!pending) {
        throw new AppError(
          "EMAIL_VERIFICATION_SESSION_REQUIRED",
          401,
          "This email verification request is no longer available. Please register again.",
        );
      }
      await limit(request, "email-resend", pending.userId, 5, 3600);
      await verifyRecaptchaToken(input.recaptchaToken, "email_resend");
      await resendEmailVerification(pending.userId, pending.accountType);
      return jsonResponse({ accepted: true }, 202);
    },
    { authenticated: false, requestBodySchema: captchaOnlySchema },
  ),
  route(
    "POST",
    "/auth/password/forgot",
    ["Authentication"],
    "Request a password reset code",
    "Public; rate limited; response is account-neutral",
    success(202, "Request accepted whether or not a local account exists.", envelope(z.object({
      accepted: z.literal(true),
    }))),
    async (request) => {
      const { recaptchaToken, ...input } = await body(request, emailAccountCaptchaSchema);
      await limit(request, "password-forgot", input.email, 5, 3600);
      await verifyRecaptchaToken(recaptchaToken, "password_forgot");
      await requestPasswordReset(input.email, input.accountType);
      return jsonResponse({ accepted: true }, 202);
    },
    { authenticated: false, requestBodySchema: emailAccountCaptchaSchema },
  ),
  route(
    "POST",
    "/auth/password/reset",
    ["Authentication"],
    "Reset a password",
    "Public; rate limited; all existing sessions are revoked",
    success(200, "Password reset.", envelope(z.object({ reset: z.literal(true) }))),
    async (request) => {
      const input = await body(request, resetPasswordSchema);
      await limit(request, "password-reset", input.email, 5, 600);
      await resetPassword(
        input.email,
        input.accountType,
        input.code,
        input.newPassword,
        input.confirmPassword,
      );
      return jsonResponse({ reset: true });
    },
    { authenticated: false, requestBodySchema: resetPasswordSchema },
  ),
  route(
    "POST",
    "/auth/amazon",
    ["Authentication"],
    "Start Amazon Login with Amazon",
    "Public; CUSTOMER and VENDOR only; requires reCAPTCHA",
    {
      responseStatus: 302,
      responseDescription: "Redirects to Amazon with a short-lived, browser-bound OAuth state.",
    },
    async (request) => {
      const input = await amazonStartBody(request);
      const locale = input.locale ?? "en";
      await limit(request, "amazon-start", input.accountType, 15, 900);
      await verifyRecaptchaToken(
        input.recaptchaToken,
        `${input.accountType.toLowerCase()}_login`,
      );
      return startAmazonLogin(input.accountType, locale);
    },
    {
      authenticated: false,
      requestBodySchema: amazonStartCaptchaSchema,
    },
  ),
  route(
    "GET",
    "/auth/amazon/callback",
    ["Authentication"],
    "Complete Amazon Login with Amazon",
    "Public OAuth callback validated with the original browser state cookie",
    {
      responseStatus: 303,
      responseDescription: "Redirects to the selected customer or vendor destination; sets the marketplace session cookie after Amazon authentication.",
    },
    async (request) => completeAmazonLogin(request),
    { authenticated: false, querySchema: amazonCallbackQuerySchema },
  ),
  route(
    "POST",
    "/admin/auth/login",
    ["Admin"],
    "Begin administrator sign-in",
    "Public; rate limited; sends OTP only after valid admin credentials",
    success(202, "Request accepted.", envelope(z.object({ accepted: z.literal(true) }))),
    async (request) => {
      const { recaptchaToken, ...input } = await body(request, adminLoginCaptchaSchema);
      await limit(request, "admin-login", input.email, 10, 900);
      await verifyRecaptchaToken(recaptchaToken, "admin_login");
      return jsonResponse(await beginAdminLogin(input.email, input.password), 202);
    },
    { authenticated: false, requestBodySchema: adminLoginCaptchaSchema },
  ),
  route(
    "POST",
    "/admin/auth/email/verify",
    ["Admin"],
    "Verify administrator email OTP",
    "Public; rate limited; returns a short-lived non-access challenge",
    success(200, "Email OTP accepted.", envelope(z.object({
      challengeId: z.string(),
      mfaRequired: z.boolean(),
    }))),
    async (request) => {
      const input = await body(request, adminEmailCodeSchema);
      await limit(request, "admin-email-verify", input.email, 5, 600);
      return jsonResponse(await verifyAdminEmail(input.email, input.code));
    },
    { authenticated: false, requestBodySchema: adminEmailCodeSchema },
  ),
  route(
    "POST",
    "/admin/auth/mfa/verify",
    ["Admin"],
    "Verify administrator MFA",
    "Email-OTP challenge; rate limited",
    success(200, "Administrator authenticated; session is set as an HttpOnly cookie.", envelope(z.object({
      user: userSchema,
    }))),
    async (request) => {
      const input = await body(request, adminChallengeSchema);
      await limit(request, "admin-mfa-verify", input.challengeId, 5, 600);
      const result = await verifyAdminMfa(input.challengeId, input.code);
      return setSessionCookie(jsonResponse({ user: result.user }), result.session);
    },
    { authenticated: false, requestBodySchema: adminChallengeSchema },
  ),
  route(
    "POST",
    "/admin/auth/mfa/setup",
    ["Admin"],
    "Set up administrator TOTP",
    "Short-lived email-OTP challenge with MFA disabled; secret is accepted in the request only",
    success(200, "Encrypted TOTP enrollment secret saved; secret is never returned.", envelope(z.object({
      setup: z.literal(true),
    }))),
    async (request) => {
      const input = await body(request, adminMfaSetupSchema);
      await limit(request, "admin-mfa-setup", input.challengeId, 5, 600);
      return jsonResponse(await setupAdminMfa(input.challengeId, input.secret));
    },
    { authenticated: false, requestBodySchema: adminMfaSetupSchema },
  ),
  route(
    "POST",
    "/admin/auth/mfa/enable",
    ["Admin"],
    "Enable administrator TOTP",
    "Short-lived email-OTP challenge; recovery codes are returned once",
    success(200, "MFA enabled; recovery codes are displayed once.", envelope(z.object({
      user: userSchema,
      recoveryCodes: z.array(z.string()),
    }))),
    async (request) => {
      const input = await body(request, adminMfaEnableSchema);
      await limit(request, "admin-mfa-enable", input.challengeId, 5, 600);
      const result = await enableAdminMfa(input.challengeId, input.code);
      return setSessionCookie(
        jsonResponse({ user: result.user, recoveryCodes: result.recoveryCodes }),
        result.session,
      );
    },
    { authenticated: false, requestBodySchema: adminMfaEnableSchema },
  ),
  route(
    "POST",
    "/admin/auth/logout",
    ["Admin"],
    "Revoke the current administrator session",
    "Authenticated ADMIN; same-origin request required",
    success(200, "Session revoked and cookie cleared.", envelope(z.object({
      loggedOut: z.literal(true),
    }))),
    async (request) => {
      assertSameOrigin(request);
      const user = await requireRole(request, "ADMIN");
      await logout(request, user);
      return clearSessionCookie(jsonResponse({ loggedOut: true }));
    },
    { authenticated: true },
  ),
  route(
    "POST",
    "/vendor/onboarding/files",
    ["Vendor Onboarding"],
    "Upload a vendor application file",
    "Authenticated VENDOR; application owner only",
    success(201, "Vendor application file uploaded.", envelope(z.object({
      file: z.object({
        id: z.uuid(),
        fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
        mimeType: z.string(),
        originalName: z.string(),
        sizeBytes: z.number().int(),
      }),
    }))),
    async (request) => {
      assertSameOrigin(request);
      const user = await requireRole(request, "VENDOR", true);
      const form = await request.formData();
      const file = form.get("file");
      const fileType = form.get("fileType");
      if (!(file instanceof File) || (fileType !== "STORE_LOGO" && fileType !== "BUSINESS_LICENSE")) {
        throw new AppError("INVALID_FILE", 400, "A valid application file is required.");
      }
      return jsonResponse(await uploadApplicationFile(user, fileType, file), 201);
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/vendor/application-files/{fileId}",
    ["Vendor Onboarding", "Admin"],
    "Read an application file",
    "Authenticated application owner or ADMIN",
    { responseStatus: 200, responseDescription: "Application file." },
    async (request, params) => {
      const user = await requireUser(request, ["VENDOR", "ADMIN"]);
      const file = await prisma.vendorApplicationFile.findUnique({
        where: { id: uuidParam(params, "fileId") },
        include: { vendorProfile: { select: { userId: true } } },
      });
      if (!file || (user.accountType === "VENDOR" && file.vendorProfile.userId !== user.id)) {
        throw new AppError("FILE_NOT_FOUND", 404, "File not found.");
      }
      return new Response(await readVendorFile(file.storageKey), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename="${file.originalName.replaceAll(/["\r\n]/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
    { authenticated: true, pathSchema: z.object({ fileId: z.uuid() }) },
  ),
  route(
    "GET",
    "/vendor/onboarding",
    ["Vendor Onboarding"],
    "Get the current vendor application",
    "Authenticated VENDOR; Amazon-authenticated users may continue without Somsuuq email OTP",
    success(200, "Vendor application draft or null.", envelope(z.object({
      application: applicationSchema.nullable(),
    }))),
    async (request) =>
      getOnboarding(await requireRole(request, "VENDOR", true)).then(jsonResponse),
    { authenticated: true },
  ),
  route(
    "POST",
    "/vendor/onboarding",
    ["Vendor Onboarding"],
    "Create a vendor application draft",
    "Authenticated VENDOR; Amazon-authenticated users may continue without Somsuuq email OTP",
    success(201, "Draft application created.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request) => {
      const input = await body(request, applicationFieldsSchema);
      return jsonResponse(
        await createDraft(await requireRole(request, "VENDOR", true), input),
        201,
      );
    },
    { authenticated: true, requestBodySchema: applicationFieldsSchema },
  ),
  route(
    "PATCH",
    "/vendor/onboarding",
    ["Vendor Onboarding"],
    "Update a vendor application draft",
    "Authenticated VENDOR; Amazon-authenticated users may continue without Somsuuq email OTP; status fields are not writable",
    success(200, "Draft application updated.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request) => {
      const input = await body(request, applicationPatchSchema);
      return jsonResponse(
        await updateDraft(await requireRole(request, "VENDOR", true), input),
      );
    },
    { authenticated: true, requestBodySchema: applicationPatchSchema },
  ),
  route(
    "POST",
    "/vendor/onboarding/submit",
    ["Vendor Onboarding"],
    "Submit the vendor application for review",
    "Authenticated VENDOR; Amazon-authenticated users may continue without Somsuuq email OTP",
    success(200, "Application submitted for review.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request) => {
      const input = await body(request, captchaOnlySchema);
      const user = await requireRole(request, "VENDOR", true);
      await limit(request, "vendor-onboarding-submit", user.id, 5, 3600);
      await verifyRecaptchaToken(input.recaptchaToken, "vendor_onboarding_submit");
      return jsonResponse(await submitApplication(user));
    },
    { authenticated: true, requestBodySchema: captchaOnlySchema },
  ),
  route(
    "GET",
    "/vendor/onboarding/status",
    ["Vendor Onboarding"],
    "Get vendor application status",
    "Authenticated VENDOR; Amazon-authenticated users may continue without Somsuuq email OTP",
    success(200, "Current vendor application and verification status.", envelope(z.object({
      status: z.string(),
      verificationStatus: z.string(),
      submittedAt: z.iso.datetime().nullable(),
      reviewedAt: z.iso.datetime().nullable(),
      rejectionReason: z.string().optional(),
      informationRequest: z.string().optional(),
    }))),
    async (request) =>
      getApplicationStatus(await requireRole(request, "VENDOR", true)).then(
        jsonResponse,
      ),
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/notifications",
    ["Admin"],
    "List administrator notifications",
    "Authenticated ADMIN",
    success(200, "Notifications.", envelope(z.object({
      notifications: z.array(z.object({
        id: z.uuid(),
        type: z.string(),
        title: z.string(),
        titleSo: z.string(),
        body: z.string(),
        bodySo: z.string(),
        href: z.string().nullable(),
        readAt: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
      })),
      unreadCount: z.number().int(),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      return jsonResponse(await listAdminNotifications());
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/sms-outbox",
    ["Admin"],
    "List simulated SMS messages saved to the outbox",
    "Authenticated ADMIN",
    success(200, "SMS outbox messages.", envelope(z.object({ messages: z.array(z.any()) }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      const params = new URL(request.url).searchParams;
      const filters = smsOutboxQuerySchema.parse({
        search: params.get("search") ?? undefined,
        messageType: params.get("messageType") ?? undefined,
        status: params.get("status") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
      });
      return jsonResponse(await listAdminSmsOutbox(filters));
    },
    { authenticated: true },
  ),
  route(
    "POST",
    "/admin/notifications/read",
    ["Admin"],
    "Mark administrator notifications read",
    "Authenticated ADMIN",
    success(200, "Notifications.", envelope(z.any())),
    async (request) => {
      assertSameOrigin(request);
      const input = await body(request, z.object({ id: z.uuid().optional() }).strict());
      await requireRole(request, "ADMIN");
      return jsonResponse(await markAdminNotificationsRead(input.id));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/overview",
    ["Admin"],
    "Get administrator dashboard metrics",
    "Authenticated ADMIN",
    success(200, "Live account and vendor application counts.", envelope(z.object({
      totalUsers: z.number().int(),
      totalCustomers: z.number().int(),
      totalVendors: z.number().int(),
      pendingApplications: z.number().int(),
      approvedVendors: z.number().int(),
      rejectedApplications: z.number().int(),
      statusBreakdown: z.object({
        draft: z.number().int(),
        pending: z.number().int(),
        approved: z.number().int(),
        rejected: z.number().int(),
        changesRequested: z.number().int(),
      }),
      recentActivity: z.array(z.object({
        id: z.uuid(),
        action: z.string(),
        createdAt: z.iso.datetime(),
        actorEmail: z.email().nullable(),
      })),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      return jsonResponse(await getAdminOverview());
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/users",
    ["Admin"],
    "List registered users",
    "Authenticated ADMIN; credential and authentication-secret fields are excluded",
    success(200, "Paginated registered users with account verification and vendor application status.", envelope(z.object({
      users: z.array(z.object({
        id: z.uuid(),
        name: z.string().nullable(),
        email: z.email(),
        accountType: z.enum(["CUSTOMER", "VENDOR", "ADMIN"]),
        isActive: z.boolean(),
        emailVerified: z.boolean(),
        createdAt: z.iso.datetime(),
        vendorApplicationStatus: vendorApplicationStatusSchema.nullable(),
      })),
      nextCursor: z.uuid().nullable(),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      const filters = query(request, adminUsersQuerySchema);
      return jsonResponse(
        await listAdminUsers(
          filters.accountType,
          filters.vendorStatus,
          filters.active,
          filters.search,
          filters.cursor,
          filters.limit,
        ),
      );
    },
    { authenticated: true, querySchema: adminUsersQuerySchema },
  ),
  route(
    "POST",
    "/admin/users/{userId}/suspend",
    ["Admin"],
    "Suspend a user account",
    "Authenticated ADMIN; cannot suspend the current administrator",
    success(200, "User suspended and sessions revoked.", envelope(z.object({
      userId: z.uuid(),
      active: z.literal(false),
    }))),
    async (request, params) => {
      assertSameOrigin(request);
      return suspendAdminUser(
        await requireRole(request, "ADMIN"),
        uuidParam(params, "userId"),
      ).then(jsonResponse);
    },
    { authenticated: true, pathSchema: z.object({ userId: z.uuid() }) },
  ),
  route(
    "DELETE",
    "/admin/users/{userId}",
    ["Admin"],
    "Permanently delete a user account",
    "Authenticated ADMIN; destructive; cannot delete the current administrator",
    success(200, "User permanently deleted.", envelope(z.object({
      userId: z.uuid(),
      deleted: z.literal(true),
    }))),
    async (request, params) => {
      assertSameOrigin(request);
      return deleteAdminUser(
        await requireRole(request, "ADMIN"),
        uuidParam(params, "userId"),
      ).then(jsonResponse);
    },
    { authenticated: true, pathSchema: z.object({ userId: z.uuid() }) },
  ),
  route(
    "GET",
    "/admin/audit-logs",
    ["Admin"],
    "List vendor application audit events",
    "Authenticated ADMIN",
    success(200, "Paginated audit entries without arbitrary metadata.", envelope(z.object({
      auditLogs: z.array(z.object({
        id: z.uuid(),
        action: z.string(),
        entityType: z.string(),
        entityId: z.uuid().nullable(),
        createdAt: z.iso.datetime(),
        actorEmail: z.email().nullable(),
      })),
      nextCursor: z.uuid().nullable(),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      const filters = query(request, adminAuditLogsQuerySchema);
      return jsonResponse(await listAdminAuditLogs(filters.cursor, filters.limit));
    },
    { authenticated: true, querySchema: adminAuditLogsQuerySchema },
  ),
  route(
    "GET",
    "/admin/vendors/applications",
    ["Admin"],
    "List submitted vendor applications",
    "Authenticated ADMIN",
    success(200, "Paginated vendor applications; drafts are not exposed.", envelope(z.object({
      applications: z.array(applicationSchema.extend({
        user: z.object({
          id: z.uuid(),
          email: z.email(),
          emailVerifiedAt: z.iso.datetime().nullable(),
          hasAmazonIdentity: z.boolean(),
        }),
      })),
      nextCursor: z.uuid().nullable(),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      const filters = query(request, applicationListQuerySchema);
      return jsonResponse(
        await listApplications(
          filters.status,
          filters.search,
          filters.cursor,
          filters.limit,
        ),
      );
    },
    { authenticated: true, querySchema: applicationListQuerySchema },
  ),
  route(
    "GET",
    "/admin/vendors/applications/{applicationId}",
    ["Admin"],
    "Get a submitted vendor application",
    "Authenticated ADMIN",
    success(200, "Vendor application details.", envelope(z.object({
      application: applicationSchema.extend({
        user: z.object({
          id: z.uuid(),
          email: z.email(),
          emailVerifiedAt: z.iso.datetime().nullable(),
          hasAmazonIdentity: z.boolean(),
        }),
      }),
    }))),
    async (request, params) => {
      await requireRole(request, "ADMIN");
      return getApplication(uuidParam(params, "applicationId")).then(jsonResponse);
    },
    {
      authenticated: true,
      pathSchema: z.object({ applicationId: z.uuid() }),
    },
  ),
  route(
    "POST",
    "/admin/vendors/applications/{applicationId}/approve",
    ["Admin"],
    "Approve a vendor application",
    "Authenticated ADMIN",
    success(200, "Application approved and audit record created.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request, params) => {
      const input = await body(request, approveApplicationSchema);
      return jsonResponse(
        await reviewApplication(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "applicationId"),
          "APPROVE",
          input.note,
        ),
      );
    },
    {
      authenticated: true,
      requestBodySchema: approveApplicationSchema,
      pathSchema: z.object({ applicationId: z.uuid() }),
    },
  ),
  route(
    "POST",
    "/admin/vendors/applications/{applicationId}/reject",
    ["Admin"],
    "Reject a vendor application",
    "Authenticated ADMIN",
    success(200, "Application rejected and audit record created.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request, params) => {
      const input = await body(request, rejectApplicationSchema);
      return jsonResponse(
        await reviewApplication(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "applicationId"),
          "REJECT",
          input.reason,
        ),
      );
    },
    {
      authenticated: true,
      requestBodySchema: rejectApplicationSchema,
      pathSchema: z.object({ applicationId: z.uuid() }),
    },
  ),
  route(
    "POST",
    "/admin/vendors/applications/{applicationId}/request-information",
    ["Admin"],
    "Request more vendor application information",
    "Authenticated ADMIN",
    success(200, "Information requested and audit record created.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request, params) => {
      const input = await body(request, requestInformationSchema);
      return jsonResponse(
        await reviewApplication(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "applicationId"),
          "REQUEST_INFORMATION",
          input.message,
        ),
      );
    },
    {
      authenticated: true,
      requestBodySchema: requestInformationSchema,
      pathSchema: z.object({ applicationId: z.uuid() }),
    },
  ),
  route(
    "POST",
    "/admin/vendors/applications/{applicationId}/email-retry",
    ["Admin"],
    "Retry a failed vendor application email",
    "Authenticated ADMIN",
    success(200, "Email retry recorded.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request, params) => {
      await requireRole(request, "ADMIN");
      const input = await body(request, vendorApplicationEmailRetrySchema);
      return retryVendorApplicationEmail(
        uuidParam(params, "applicationId"),
        input.event,
      ).then(jsonResponse);
    },
    {
      authenticated: true,
      requestBodySchema: vendorApplicationEmailRetrySchema,
      pathSchema: z.object({ applicationId: z.uuid() }),
    },
  ),
  route(
    "POST",
    "/admin/vendors/{vendorId}/suspend",
    ["Admin"],
    "Suspend an approved vendor",
    "Authenticated ADMIN",
    success(200, "Vendor suspended and audit record created.", envelope(z.object({
      application: applicationSchema,
    }))),
    async (request, params) => {
      const input = await body(request, suspendVendorSchema);
      return jsonResponse(
        await suspendVendor(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "vendorId"),
          input.reason,
        ),
      );
    },
    {
      authenticated: true,
      requestBodySchema: suspendVendorSchema,
      pathSchema: z.object({ vendorId: z.uuid() }),
    },
  ),
  route(
    "GET",
    "/vendor/profile-changes",
    ["Vendor"],
    "Get the vendor's current profile change request",
    "Authenticated approved VENDOR",
    success(200, "Current profile change request.", envelope(z.object({ changeRequest: z.any().nullable() }))),
    async (request) => jsonResponse(await getVendorProfileChange(await requireRole(request, "VENDOR", true))),
    { authenticated: true },
  ),
  route(
    "POST",
    "/vendor/profile-changes",
    ["Vendor"],
    "Save a vendor profile change draft",
    "Authenticated approved VENDOR",
    success(200, "Profile change draft saved.", envelope(z.object({ changeRequest: z.any() }))),
    async (request) => jsonResponse(await saveProfileChangeDraft(await requireRole(request, "VENDOR", true), await body(request, profileChangeFieldsSchema))),
    { authenticated: true, requestBodySchema: profileChangeFieldsSchema },
  ),
  route(
    "POST",
    "/vendor/profile-changes/submit",
    ["Vendor"],
    "Submit a vendor profile change request for review",
    "Authenticated approved VENDOR",
    success(200, "Profile change submitted.", envelope(z.object({ changeRequest: z.any() }))),
    async (request) => {
      const input = await body(request, submitProfileChangeSchema);
      const user = await requireRole(request, "VENDOR", true);
      await limit(request, "vendor-profile-change-submit", user.id, 5, 3600);
      await verifyRecaptchaToken(input.recaptchaToken, "vendor_profile_change_submit");
      const fields = profileChangeFieldsSchema.parse(input);
      return jsonResponse(await submitProfileChange(user, fields));
    },
    { authenticated: true, requestBodySchema: submitProfileChangeSchema },
  ),
  route(
    "POST",
    "/vendor/profile-changes/files",
    ["Vendor"],
    "Upload a file for a vendor profile change request",
    "Authenticated approved VENDOR",
    success(201, "Profile change file uploaded.", envelope(z.object({ file: z.any(), changeRequest: z.any() }))),
    async (request) => {
      const user = await requireRole(request, "VENDOR", true);
      assertSameOrigin(request);
      const form = await request.formData();
      const file = form.get("file");
      const fileType = form.get("fileType");
      if (!(file instanceof File) || (fileType !== "STORE_LOGO" && fileType !== "BUSINESS_LICENSE")) {
        throw new AppError("INVALID_FILE", 400, "A valid application file is required.");
      }
      return jsonResponse(await uploadProfileChangeFile(user, fileType, file), 201);
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/vendor/profile-change-files/{fileId}",
    ["Vendor", "Admin"],
    "Read a profile change request file",
    "Authenticated application owner or ADMIN",
    { responseStatus: 200, responseDescription: "Profile change file." },
    async (request, params) => {
      const user = await requireUser(request, ["VENDOR", "ADMIN"]);
      const file = await getProfileChangeFile(uuidParam(params, "fileId"), user);
      return new Response(await readVendorFile(file.storageKey), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename="${file.originalName.replaceAll(/["\r\n]/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
    { authenticated: true, pathSchema: z.object({ fileId: z.uuid() }) },
  ),
  route(
    "POST",
    "/admin/vendors/profile-changes/{changeRequestId}/approve",
    ["Admin"],
    "Approve a vendor profile change request",
    "Authenticated ADMIN",
    success(200, "Profile changes applied.", envelope(z.object({ changeRequest: z.any() }))),
    async (request, params) => {
      const input = await body(request, reviewProfileChangeSchema);
      return jsonResponse(
        await reviewProfileChange(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "changeRequestId"),
          "APPROVE",
          input.note,
        ),
      );
    },
    { authenticated: true, requestBodySchema: reviewProfileChangeSchema, pathSchema: z.object({ changeRequestId: z.uuid() }) },
  ),
  route(
    "POST",
    "/admin/vendors/profile-changes/{changeRequestId}/reject",
    ["Admin"],
    "Reject a vendor profile change request",
    "Authenticated ADMIN",
    success(200, "Profile changes rejected.", envelope(z.object({ changeRequest: z.any() }))),
    async (request, params) => {
      const input = await body(request, rejectApplicationSchema);
      return jsonResponse(
        await reviewProfileChange(
          await requireRole(request, "ADMIN"),
          uuidParam(params, "changeRequestId"),
          "REJECT",
          input.reason,
        ),
      );
    },
    { authenticated: true, requestBodySchema: rejectApplicationSchema, pathSchema: z.object({ changeRequestId: z.uuid() }) },
  ),
  route(
    "GET",
    "/cart",
    ["Customer"],
    "Get the current shopping cart",
    "Customer session or guest cart cookie",
    success(200, "Cart contents.", envelope(z.object({ cart: z.any() }))),
    async (request) => cartJson(request, await getCart(await getOptionalCustomer(request), guestCartKey(request))),
  ),
  route(
    "POST",
    "/cart/items",
    ["Customer"],
    "Add a variant to the cart",
    "Customer session or guest cart cookie",
    success(200, "Cart updated.", envelope(z.object({ cart: z.any() }))),
    async (request) => {
      const input = await body(request, addCartSchema);
      const result = await addToCart(await getOptionalCustomer(request), guestCartKey(request), input.variantId, input.quantity ?? 1);
      return cartJson(request, { cart: result.cart }, result.guestKey);
    },
    { authenticated: false, requestBodySchema: addCartSchema },
  ),
  route(
    "POST",
    "/cart/items/{itemId}",
    ["Customer"],
    "Update a cart item quantity",
    "Customer session or guest cart cookie",
    success(200, "Cart updated.", envelope(z.object({ cart: z.any() }))),
    async (request, params) => {
      const input = await body(request, updateCartSchema);
      return cartJson(request, await updateCartItem(await getOptionalCustomer(request), guestCartKey(request), uuidParam(params, "itemId"), input.quantity));
    },
    { authenticated: false, requestBodySchema: updateCartSchema, pathSchema: z.object({ itemId: z.uuid() }) },
  ),
  route(
    "POST",
    "/cart/clear",
    ["Customer"],
    "Clear the shopping cart",
    "Customer session or guest cart cookie",
    success(200, "Cart cleared.", envelope(z.object({ cart: z.any() }))),
    async (request) => cartJson(request, await clearCart(await getOptionalCustomer(request), guestCartKey(request))),
  ),
  route(
    "GET",
    "/customer/profile",
    ["Customer"],
    "Get the authenticated customer's profile",
    "Authenticated CUSTOMER",
    success(200, "Customer profile.", envelope(z.object({
      profile: z.object({
        id: z.uuid(),
        email: z.email(),
        displayName: z.string().nullable(),
        emailVerified: z.boolean(),
        createdAt: z.iso.datetime(),
        hasProfilePhoto: z.boolean(),
      }),
    }))),
    async (request) => jsonResponse(await getCustomerProfile(await requireRole(request, "CUSTOMER"))),
    { authenticated: true },
  ),
  route(
    "PATCH",
    "/customer/profile",
    ["Customer"],
    "Update the authenticated customer's profile",
    "Authenticated CUSTOMER; same-origin",
    success(200, "Customer profile updated.", envelope(z.object({ profile: z.any() }))),
    async (request) => {
      const input = await body(request, customerProfilePatchSchema);
      return jsonResponse(await updateCustomerProfile(await requireRole(request, "CUSTOMER"), input.displayName));
    },
    { authenticated: true, requestBodySchema: customerProfilePatchSchema },
  ),
  route(
    "POST",
    "/customer/profile/photo",
    ["Customer"],
    "Upload the authenticated customer's profile photo",
    "Authenticated CUSTOMER; same-origin",
    success(200, "Customer profile photo updated.", envelope(z.object({ updated: z.literal(true) }))),
    async (request) => {
      assertSameOrigin(request);
      const user = await requireRole(request, "CUSTOMER");
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) throw new AppError("INVALID_FILE", 400, "A profile photo is required.");
      return jsonResponse(await updateCustomerProfilePhoto(user, file));
    },
    { authenticated: true },
  ),
  route(
    "DELETE",
    "/customer/profile/photo",
    ["Customer"],
    "Remove the authenticated customer's profile photo",
    "Authenticated CUSTOMER; same-origin",
    success(200, "Customer profile photo removed.", envelope(z.object({ updated: z.literal(true) }))),
    async (request) => {
      assertSameOrigin(request);
      return jsonResponse(await removeCustomerProfilePhoto(await requireRole(request, "CUSTOMER")));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/customer/profile/photo",
    ["Customer"],
    "Get the authenticated customer's profile photo",
    "Authenticated CUSTOMER",
    { responseStatus: 200, responseDescription: "Customer profile photo." },
    async (request) => {
      const photo = await getCustomerProfilePhoto(await requireRole(request, "CUSTOMER"));
      return new Response(photo.bytes, {
        headers: {
          "Content-Type": photo.mimeType,
          "Cache-Control": "private, no-store",
        },
      });
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/customer/notifications",
    ["Customer"],
    "List customer notifications",
    "Authenticated CUSTOMER",
    success(200, "Customer notifications.", envelope(z.any())),
    async (request) => jsonResponse(await listCustomerNotifications(await requireRole(request, "CUSTOMER"))),
    { authenticated: true },
  ),
  route(
    "POST",
    "/customer/notifications/read",
    ["Customer"],
    "Mark customer notifications read",
    "Authenticated CUSTOMER; same-origin",
    success(200, "Customer notifications.", envelope(z.any())),
    async (request) => {
      const input = await body(request, z.object({ id: z.uuid().optional() }).strict());
      return jsonResponse(await markCustomerNotificationsRead(await requireRole(request, "CUSTOMER"), input.id));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/customer/payments",
    ["Customer"],
    "List the customer's simulated payment attempts",
    "Authenticated CUSTOMER",
    success(200, "Payment history.", envelope(z.object({ payments: z.array(z.any()) }))),
    async (request) => jsonResponse(await listCustomerPaymentHistory(await requireRole(request, "CUSTOMER"))),
    { authenticated: true },
  ),
  route(
    "GET",
    "/customer/orders/{orderId}/receipt",
    ["Customer"],
    "Get a receipt for the customer's simulated payment",
    "Authenticated owner of the order",
    success(200, "Payment receipt.", envelope(z.object({ receipt: z.any() }))),
    async (request, params) => {
      const receipt = await getCustomerPaymentReceipt(await requireRole(request, "CUSTOMER"), uuidParam(params, "orderId"));
      if (!receipt) throw new AppError("RECEIPT_NOT_FOUND", 404, "No successful simulated payment receipt was found.");
      return jsonResponse({ receipt });
    },
    { authenticated: true, pathSchema: z.object({ orderId: z.uuid() }) },
  ),
  route(
    "GET",
    "/customer/orders",
    ["Customer"],
    "List the customer's orders",
    "Authenticated CUSTOMER",
    success(200, "Customer orders.", envelope(z.object({ orders: z.array(z.any()) }))),
    async (request) => {
      const user = await requireRole(request, "CUSTOMER");
      const filters = query(request, customerOrdersQuerySchema);
      return jsonResponse(await listCustomerOrders(user, filters.search, filters.status));
    },
    { authenticated: true, querySchema: customerOrdersQuerySchema },
  ),
  route(
    "GET",
    "/customer/returns",
    ["Customer"],
    "List the customer's return requests",
    "Authenticated CUSTOMER",
    success(200, "Customer returns.", envelope(z.object({ returns: z.array(z.any()) }))),
    async (request) => jsonResponse(await listCustomerReturns(await requireRole(request, "CUSTOMER"))),
    { authenticated: true },
  ),
  route(
    "GET",
    "/customer/orders/{orderId}",
    ["Customer"],
    "Get a customer order",
    "Authenticated CUSTOMER",
    success(200, "Customer order.", envelope(z.object({ order: z.any() }))),
    async (request, params) => jsonResponse(await getCustomerOrder(await requireRole(request, "CUSTOMER"), uuidParam(params, "orderId"))),
    { authenticated: true, pathSchema: z.object({ orderId: z.uuid() }) },
  ),
  route(
    "POST",
    "/customer/orders/{vendorOrderId}/confirm-delivery",
    ["Customer"],
    "Confirm delivery of a vendor sub-order",
    "Authenticated CUSTOMER",
    success(200, "Delivery confirmed.", envelope(z.object({ order: z.any() }))),
    async (request, params) => jsonResponse(await confirmCustomerDelivery(await requireRole(request, "CUSTOMER"), uuidParam(params, "vendorOrderId"))),
    { authenticated: true, pathSchema: z.object({ vendorOrderId: z.uuid() }) },
  ),
  route(
    "GET",
    "/vendor/orders",
    ["Vendor"],
    "List the vendor's sub-orders",
    "Authenticated approved VENDOR",
    success(200, "Vendor orders.", envelope(z.object({ orders: z.array(z.any()) }))),
    async (request) => jsonResponse(await listVendorOrders(await requireRole(request, "VENDOR", true), new URL(request.url).searchParams.get("status") ?? undefined)),
    { authenticated: true },
  ),
  route(
    "GET",
    "/vendor/returns",
    ["Vendor"],
    "List return requests for this vendor",
    "Authenticated approved VENDOR",
    success(200, "Vendor returns.", envelope(z.object({ returns: z.array(z.any()) }))),
    async (request) => jsonResponse(await listVendorReturns(await requireRole(request, "VENDOR", true))),
    { authenticated: true },
  ),
  route(
    "POST",
    "/vendor/orders/{vendorOrderId}/status",
    ["Vendor"],
    "Update a vendor sub-order status",
    "Authenticated approved VENDOR",
    success(200, "Vendor orders.", envelope(z.object({ orders: z.array(z.any()) }))),
    async (request, params) => {
      const input = await body(request, vendorOrderStatusSchema);
      return jsonResponse(await updateVendorOrderStatus(await requireRole(request, "VENDOR", true), uuidParam(params, "vendorOrderId"), input.status, input));
    },
    { authenticated: true, requestBodySchema: vendorOrderStatusSchema, pathSchema: z.object({ vendorOrderId: z.uuid() }) },
  ),
  route(
    "POST",
    "/vendor/inventory/{variantId}",
    ["Vendor"],
    "Update variant stock",
    "Authenticated approved VENDOR",
    success(200, "Stock updated.", envelope(z.object({ updated: z.literal(true), stockQuantity: z.number() }))),
    async (request, params) => {
      const input = await body(request, stockSchema);
      return jsonResponse(await updateVendorStock(await requireRole(request, "VENDOR", true), uuidParam(params, "variantId"), input.stockQuantity));
    },
    { authenticated: true, requestBodySchema: stockSchema, pathSchema: z.object({ variantId: z.uuid() }) },
  ),
  route(
    "GET",
    "/vendor/notifications",
    ["Vendor"],
    "List vendor notifications",
    "Authenticated approved VENDOR",
    success(200, "Notifications.", envelope(z.any())),
    async (request) => jsonResponse(await listVendorNotifications(await requireRole(request, "VENDOR", true))),
    { authenticated: true },
  ),
  route(
    "POST",
    "/vendor/notifications/read",
    ["Vendor"],
    "Mark vendor notifications read",
    "Authenticated approved VENDOR",
    success(200, "Notifications.", envelope(z.any())),
    async (request) => {
      const input = await body(request, z.object({ id: z.uuid().optional() }).strict());
      return jsonResponse(await markVendorNotificationsRead(await requireRole(request, "VENDOR", true), input.id));
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/vendor/analytics",
    ["Vendor"],
    "Vendor sales analytics",
    "Authenticated approved VENDOR",
    success(200, "Analytics.", envelope(z.any())),
    async (request) => jsonResponse(await vendorAnalytics(await requireRole(request, "VENDOR", true))),
    { authenticated: true },
  ),
  route(
    "GET",
    "/vendor/coupons",
    ["Vendor"],
    "List the authenticated vendor's coupons",
    "Authenticated approved VENDOR",
    success(200, "Coupons.", envelope(z.object({ coupons: z.array(z.any()) }))),
    async (request) => jsonResponse(await listVendorCoupons((await requireRole(request, "VENDOR", true)).id)),
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/coupons",
    ["Admin"],
    "List platform coupons",
    "Authenticated ADMIN",
    success(200, "Coupons.", envelope(z.object({ coupons: z.array(z.any()) }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      return jsonResponse(await listAdminCoupons());
    },
    { authenticated: true },
  ),
  route(
    "GET",
    "/admin/categories",
    ["Admin"],
    "List all categories including inactive",
    "Authenticated ADMIN",
    success(200, "Categories.", envelope(z.object({ categories: z.array(z.any()) }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      return jsonResponse({ categories: await listCategories(true) });
    },
    { authenticated: true },
  ),
  route(
    "POST",
    "/admin/categories",
    ["Admin"],
    "Create a marketplace category",
    "Authenticated ADMIN",
    success(201, "Category created.", envelope(z.object({ category: z.any() }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      return jsonResponse({ category: await createCategory(await body(request, categoryWriteSchema)) }, 201);
    },
    { authenticated: true, requestBodySchema: categoryWriteSchema },
  ),
  route(
    "PATCH",
    "/admin/categories/{categoryId}",
    ["Admin"],
    "Update a marketplace category",
    "Authenticated ADMIN",
    success(200, "Category updated.", envelope(z.object({ category: z.any() }))),
    async (request, params) => {
      await requireRole(request, "ADMIN");
      return jsonResponse({ category: await updateCategory(uuidParam(params, "categoryId"), await body(request, categoryPatchSchema)) });
    },
    { authenticated: true, requestBodySchema: categoryPatchSchema, pathSchema: z.object({ categoryId: z.uuid() }) },
  ),
  route("POST", "/checkout/reserve", ["Customer"], "Reserve cart stock for 10 minutes", "Authenticated CUSTOMER", success(200, "Reservation created.", envelope(z.any())), async (request) => jsonResponse(await startCheckoutReservation(await requireRole(request, "CUSTOMER"), guestCartKey(request))), { authenticated: true }),
  route("POST", "/checkout/quote", ["Customer"], "Calculate the server-side checkout total", "Authenticated CUSTOMER", success(200, "Checkout total.", envelope(z.any())), async (request) => {
    const input = await body(request, checkoutQuoteSchema);
    return jsonResponse(await quoteCheckoutReservation(await requireRole(request, "CUSTOMER"), input));
  }, { authenticated: true, requestBodySchema: checkoutQuoteSchema }),
  route("POST", "/checkout/pay", ["Customer"], "Complete simulated EVC Plus, Zaad or eDahab payment", "Authenticated CUSTOMER", success(200, "Payment result.", envelope(z.any())), async (request) => {
    const input = await body(request, paySchema);
    await verifyRecaptchaToken(input.recaptchaToken, "checkout_simulate");
    const user = await requireRole(request, "CUSTOMER");
    const { recaptchaToken, ...payload } = input;
    void recaptchaToken;
    return jsonResponse(await paySimulatedMobileMoney(user, guestCartKey(request), payload));
  }, { authenticated: true, requestBodySchema: paySchema }),
  route("POST", "/checkout/cancel", ["Customer"], "Cancel a simulated checkout and release its reservation", "Authenticated CUSTOMER", success(200, "Checkout cancelled.", envelope(z.any())), async (request) => {
    const input = await body(request, cancelPaymentSchema);
    return jsonResponse(await cancelCheckoutReservation(await requireRole(request, "CUSTOMER"), input));
  }, { authenticated: true, requestBodySchema: cancelPaymentSchema }),
  route("POST", "/products/{productId}/reviews", ["Customer"], "Create a product review from an eligible delivered order item", "Authenticated CUSTOMER with a delivered item", success(201, "Review created.", envelope(z.any())), async (request, params) => {
    const user = await requireRole(request, "CUSTOMER");
    const { data: input, photo } = await imageForm(request, reviewSchema);
    const uploaded = photo ? await saveProductImage(photo) : null;
    try {
      return jsonResponse({
        review: await createReview(
          user,
          uuidParam(params, "productId"),
          input.orderLineId,
          input.rating,
          input.comment,
          uploaded?.storageKey,
        ),
      }, 201);
    } catch (error) {
      if (uploaded) await removeVendorFile(uploaded.storageKey);
      throw error;
    }
  }, { authenticated: true, pathSchema: z.object({ productId: z.uuid() }) }),
  route("GET", "/admin/reviews", ["Admin"], "List and filter customer product reviews", "Authenticated ADMIN", success(200, "Reviews.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    const filters = query(request, reviewModerationQuerySchema);
    return jsonResponse(await listAdminReviews({
      productId: filters.productId,
      productSearch: filters.product,
      rating: filters.rating,
      status: filters.status,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
    }));
  }, { authenticated: true, querySchema: reviewModerationQuerySchema }),
  route("POST", "/admin/reviews/{reviewId}/hide", ["Admin"], "Hide a product review with an audit reason", "Authenticated ADMIN", success(200, "Review hidden.", envelope(z.any())), async (request, params) => jsonResponse({ review: await hideReview(await requireRole(request, "ADMIN"), uuidParam(params, "reviewId"), (await body(request, z.object({ reason: z.string().trim().min(3).max(500) }).strict())).reason) }), { authenticated: true, pathSchema: z.object({ reviewId: z.uuid() }) }),
  route("POST", "/admin/reviews/{reviewId}/restore", ["Admin"], "Restore a hidden product review", "Authenticated ADMIN", success(200, "Review restored.", envelope(z.any())), async (request, params) => jsonResponse({ review: await restoreReview(await requireRole(request, "ADMIN"), uuidParam(params, "reviewId"), (await body(request, z.object({ reason: z.string().trim().min(3).max(500) }).strict())).reason) }), { authenticated: true, pathSchema: z.object({ reviewId: z.uuid() }) }),
  route("GET", "/admin/returns", ["Admin"], "List and filter return requests and disputes", "Authenticated ADMIN", success(200, "Return requests.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    const filters = query(request, adminReturnsQuerySchema);
    return jsonResponse(await listAdminReturns(filters.status));
  }, { authenticated: true, querySchema: adminReturnsQuerySchema }),
  route("POST", "/coupons", ["Marketplace"], "Create a vendor or platform coupon", "Authenticated VENDOR or ADMIN", success(201, "Coupon saved.", envelope(z.any())), async (request) => {
    const input = await body(request, couponSchema);
    const user = await requireUser(request, input.scope === "PLATFORM" ? ["ADMIN"] : ["VENDOR", "ADMIN"]);
    return jsonResponse({ coupon: await upsertCoupon(user, input) }, 201);
  }, { authenticated: true, requestBodySchema: couponSchema }),
  route("POST", "/returns", ["Customer"], "Request a quantity-specific return from an order item", "Authenticated CUSTOMER", success(201, "Return requested.", envelope(z.any())), async (request) => {
    const user = await requireRole(request, "CUSTOMER");
    const { data: input, photo } = await imageForm(request, returnSchema);
    const uploaded = photo ? await saveProductImage(photo) : null;
    try {
      return jsonResponse({
        returnRequest: await requestReturn(
          user,
          input.orderLineId,
          input.reason,
          input.explanation ?? "",
          input.quantity,
          uploaded?.storageKey,
        ),
      }, 201);
    } catch (error) {
      if (uploaded) await removeVendorFile(uploaded.storageKey);
      throw error;
    }
  }, { authenticated: true }),
  route("POST", "/returns/{returnId}/action", ["Marketplace"], "Advance a return request", "Customer, vendor or admin", success(200, "Return updated.", envelope(z.any())), async (request, params) => {
    const input = await body(request, returnActionSchema);
    const user = input.action === "APPROVE" || input.action === "REJECT" || input.action === "RECEIVE"
      ? await requireRole(request, "VENDOR", true)
      : input.action === "ADMIN_APPROVE" || input.action === "ADMIN_REJECT"
        ? await requireRole(request, "ADMIN")
        : await requireRole(request, "CUSTOMER");
    return jsonResponse({ returnRequest: await reviewReturn(user, uuidParam(params, "returnId"), input.action, input.note, input.instructions) });
  }, { authenticated: true, requestBodySchema: returnActionSchema, pathSchema: z.object({ returnId: z.uuid() }) }),
  route("GET", "/vendor/payouts", ["Vendor"], "View the authenticated vendor's financial statement and payouts", "Authenticated approved VENDOR", success(200, "Vendor financial statement.", envelope(z.any())), async (request) => {
    const user = await requireRole(request, "VENDOR", true);
    const filters = query(request, financialStatementQuerySchema);
    return jsonResponse(await getVendorFinancialStatement(user.id, {
      ...filters,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
    }));
  }, { authenticated: true, querySchema: financialStatementQuerySchema }),
  route("GET", "/admin/commission-settings", ["Admin"], "View default and category commission rules", "Authenticated ADMIN", success(200, "Commission settings.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    return jsonResponse(await getAdminCommissionSettings());
  }, { authenticated: true }),
  route("POST", "/admin/commission-settings", ["Admin"], "Update the default marketplace commission", "Authenticated ADMIN", success(200, "Default commission updated.", envelope(z.any())), async (request) => {
    const admin = await requireRole(request, "ADMIN");
    const input = await body(request, defaultCommissionSchema);
    return jsonResponse({ settings: await updateDefaultCommission(admin, input.percent) });
  }, { authenticated: true, requestBodySchema: defaultCommissionSchema }),
  route("GET", "/admin/commissions", ["Admin"], "View category commission rules", "Authenticated ADMIN", success(200, "Category commissions.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    return jsonResponse(await getAdminCommissionSettings());
  }, { authenticated: true }),
  route("POST", "/admin/commissions", ["Admin"], "Create or update a category commission rule", "Authenticated ADMIN", success(200, "Commission saved.", envelope(z.any())), async (request) => {
    const admin = await requireRole(request, "ADMIN");
    const input = await body(request, commissionRuleSchema);
    return jsonResponse({ commission: await updateCategoryCommission(admin, input.categoryId, input.percent, input.isActive) });
  }, { authenticated: true, requestBodySchema: commissionRuleSchema }),
  route("GET", "/admin/payouts/preview", ["Admin"], "Preview eligible vendor payout balances", "Authenticated ADMIN; optional development-only payout hold override", success(200, "Payout preview.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    const filters = query(request, payoutHoldQuerySchema);
    return jsonResponse(await previewPayoutBalances(new Date(), filters.holdDays));
  }, { authenticated: true, querySchema: payoutHoldQuerySchema }),
  route("GET", "/admin/payouts", ["Admin"], "List payout batches and vendor payouts", "Authenticated ADMIN", success(200, "Payout batches.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    return jsonResponse(await listAdminPayoutBatches());
  }, { authenticated: true }),
  route("POST", "/admin/payouts/batches", ["Admin"], "Create a pending weekly payout batch", "Authenticated ADMIN; optional development-only payout hold override", success(201, "Payout batch created.", envelope(z.any())), async (request) => {
    const admin = await requireRole(request, "ADMIN");
    const input = await body(request, payoutHoldOverrideSchema);
    return jsonResponse(await createWeeklyPayoutBatch(admin.id, new Date(), input.holdDays), 201);
  }, { authenticated: true, requestBodySchema: payoutHoldOverrideSchema }),
  route("POST", "/admin/payouts/batches/{batchId}/approve", ["Admin"], "Approve and record a simulated payout batch", "Authenticated ADMIN; optional development-only payout hold override", success(200, "Payout batch approved as simulated.", envelope(z.any())), async (request, params) => {
    const admin = await requireRole(request, "ADMIN");
    const input = await body(request, payoutHoldOverrideSchema);
    return jsonResponse(await approvePayoutBatch(admin, uuidParam(params, "batchId"), input.holdDays));
  }, { authenticated: true, requestBodySchema: payoutHoldOverrideSchema, pathSchema: z.object({ batchId: z.uuid() }) }),
  route("POST", "/admin/payouts/{payoutId}/retry", ["Admin"], "Retry a failed simulated vendor payout", "Authenticated ADMIN; optional development-only payout hold override", success(200, "Failed payout retried as simulated.", envelope(z.any())), async (request, params) => {
    const admin = await requireRole(request, "ADMIN");
    const input = await body(request, payoutHoldOverrideSchema);
    return jsonResponse(await retryFailedVendorPayout(admin, uuidParam(params, "payoutId"), input.holdDays));
  }, { authenticated: true, requestBodySchema: payoutHoldOverrideSchema, pathSchema: z.object({ payoutId: z.uuid() }) }),
  route("POST", "/admin/payouts/batches/{batchId}/cancel", ["Admin"], "Cancel a pending payout batch", "Authenticated ADMIN", success(200, "Payout batch cancelled.", envelope(z.any())), async (request, params) => {
    const admin = await requireRole(request, "ADMIN");
    return jsonResponse(await cancelPayoutBatch(admin, uuidParam(params, "batchId")));
  }, { authenticated: true, pathSchema: z.object({ batchId: z.uuid() }) }),
  route("GET", "/admin/financial-reconciliation", ["Admin"], "Compare paid delivered orders with financial ledger entries", "Authenticated ADMIN", success(200, "Financial reconciliation.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    return jsonResponse(await getFinancialReconciliation());
  }, { authenticated: true }),
  route("POST", "/admin/payouts/simulate-weekly", ["Admin"], "Create simulated weekly vendor payouts", "Authenticated ADMIN", success(200, "Payouts simulated.", envelope(z.any())), async (request) => {
    const admin = await requireRole(request, "ADMIN");
    return jsonResponse(await createWeeklyPayoutBatch(admin.id));
  }, { authenticated: true }),
  route("GET", "/admin/marketplace-analytics", ["Admin"], "Marketplace financial analytics", "Authenticated ADMIN", success(200, "Analytics.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ? new Date(params.get("from")!) : undefined;
    const to = params.get("to") ? new Date(params.get("to")!) : undefined;
    return jsonResponse(await adminMarketplaceAnalytics(from, to));
  }, { authenticated: true }),
  route("POST", "/vendor/delivery-fee", ["Vendor"], "Set vendor delivery fee", "Authenticated approved VENDOR", success(200, "Delivery fee saved.", envelope(z.any())), async (request) => jsonResponse({ rule: await setDeliveryFee(await requireRole(request, "VENDOR", true), (await body(request, z.object({ fee: z.coerce.number().min(0).max(9999) }).strict())).fee) }), { authenticated: true }),
  route("POST", "/jobs/expire", ["Admin"], "Expire reservations and unconfirmed orders", "Authenticated ADMIN", success(200, "Expired.", envelope(z.any())), async (request) => {
    await requireRole(request, "ADMIN");
    await expireReservations();
    const { expireStaleVendorOrders } = await import("@/features/commerce/service");
    await expireStaleVendorOrders();
    return jsonResponse({ ok: true });
  }, { authenticated: true }),
];

function guestCartKey(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${guestCartCookieName()}=`));
  return match ? decodeURIComponent(match.slice(guestCartCookieName().length + 1)) : null;
}

function cartJson(request: Request, data: unknown, guestKey?: string | null) {
  const response = jsonResponse(data);
  const key = guestKey ?? guestCartKey(request);
  if (key) {
    response.headers.append(
      "Set-Cookie",
      `${guestCartCookieName()}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );
  }
  return response;
}

export async function dispatchApiRequest(
  request: Request,
  segments: string[],
): Promise<Response> {
  return handleApiRequest(async () => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "POST" && method !== "PATCH" && method !== "DELETE") {
      throw new AppError("METHOD_NOT_ALLOWED", 405, "The HTTP method is not supported.");
    }

    const path = `/${segments.join("/")}`;
    for (const candidate of routes) {
      if (candidate.method !== method) continue;
      const params = matchPath(candidate.path, path);
      if (params) return candidate.handler(request, params);
    }
    throw new AppError("NOT_FOUND", 404, "The requested API resource was not found.");
  });
}

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const definition of routes) {
    const request = {
      ...(definition.requestBodySchema
        ? {
            body: {
              required: true,
              content:
                definition.path === "/auth/amazon"
                  ? {
                      "application/json": {
                        schema: definition.requestBodySchema,
                      },
                      "application/x-www-form-urlencoded": {
                        schema: definition.requestBodySchema,
                      },
                    }
                  : {
                      "application/json": {
                        schema: definition.requestBodySchema,
                      },
                    },
            },
          }
        : {}),
      ...(definition.querySchema ? { query: definition.querySchema } : {}),
      ...(definition.pathSchema ? { params: definition.pathSchema } : {}),
    };
    const successContent = definition.responseSchema
      ? {
          content: {
            "application/json": {
              schema: definition.responseSchema,
              examples: {
                success: {
                  summary: "Example success response",
                  value: successExample(definition.path, definition.method),
                },
              },
            },
          },
        }
      : {};
    const pendingVerificationRoute =
      definition.path === "/auth/email/verify" ||
      definition.path === "/auth/email/resend";
    const unsupportedMediaTypeDescription =
      definition.path === "/auth/amazon"
        ? "Expected JSON or form-urlencoded."
        : "Expected application/json.";

    registry.registerPath({
      method: openApiMethod(definition.method),
      path: `/api/v1${definition.path}`,
      tags: definition.tags,
      summary: definition.summary,
      description: `Access: ${definition.permission}. Cookie-authenticated unsafe methods require a same-origin Origin header. Rate limits apply to public authentication flows.`,
      security: definition.authenticated
        ? [{ sessionCookie: [] }]
        : pendingVerificationRoute
          ? [{ pendingEmailVerificationCookie: [] }]
          : [],
      ...(Object.keys(request).length > 0 ? { request } : {}),
      responses: {
        [definition.responseStatus]: {
          description: definition.responseDescription,
          ...successContent,
        },
        "400": errorResponse(
          "Malformed JSON or invalid request schema.",
          "VALIDATION_ERROR",
        ),
        "401": errorResponse("Authentication failed or session is invalid.", "UNAUTHENTICATED"),
        "403": errorResponse("Forbidden, CSRF check failed, or email is unverified.", "FORBIDDEN"),
        "404": errorResponse("Resource not found.", "NOT_FOUND"),
        "405": errorResponse("HTTP method is not supported.", "METHOD_NOT_ALLOWED"),
        "409": errorResponse("Conflict with the current resource state.", "CONFLICT"),
        "413": errorResponse("Request payload is too large.", "PAYLOAD_TOO_LARGE"),
        "415": errorResponse(unsupportedMediaTypeDescription, "UNSUPPORTED_MEDIA_TYPE"),
        "429": errorResponse("Rate limit exceeded.", "RATE_LIMITED"),
        "500": errorResponse("Unexpected server error.", "INTERNAL_SERVER_ERROR"),
        "503": errorResponse("Required external integration is unavailable.", "SERVICE_UNAVAILABLE"),
      },
    });
  }

  registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name:
      process.env.NODE_ENV === "production"
        ? "__Host-marketplace_session"
        : "marketplace_session",
    description:
      "Short-lived JWT access cookie; HttpOnly and SameSite=Lax, Secure in production. A separate rotating refresh cookie restores access sessions server-side. Unsafe cookie-authenticated requests require a same-origin Origin header.",
  });
  registry.registerComponent(
    "securitySchemes",
    "pendingEmailVerificationCookie",
    {
      type: "apiKey",
      in: "cookie",
      name:
        process.env.NODE_ENV === "production"
          ? "__Host-marketplace_pending_email_verification"
          : "marketplace_pending_email_verification",
      description:
        "Short-lived HttpOnly cookie issued by customer/vendor registration. The browser sends it automatically to bind verification and resend requests to that registration. SameSite=Strict; Secure in production and on HTTPS.",
    },
  );

  const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Somali Multi-Vendor Marketplace API",
      version: "1.0.0",
      description:
        "Versioned marketplace REST API. JWT access and rotating refresh credentials are delivered only through HttpOnly cookies.",
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Authentication", description: "Customer and vendor authentication." },
      { name: "Customer", description: "Customer-specific account operations." },
      { name: "Vendor Onboarding", description: "Vendor application and review status." },
      { name: "Admin", description: "Private administrator authentication and vendor review." },
    ],
  });
  return document;
}

function successExample(path: string, method: HttpMethod): unknown {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "shopper@example.com",
    accountType: path.includes("/admin/")
      ? "ADMIN"
      : path.includes("/vendor/")
        ? "VENDOR"
        : "CUSTOMER",
    emailVerified: !path.endsWith("/register"),
  };
  const application = {
    id: "22222222-2222-4222-8222-222222222222",
    applicationStatus: "PENDING",
    verificationStatus: "PENDING",
    businessName: "Example business",
    storeName: "Example store",
    businessType: "Retail",
    description: "A local marketplace seller.",
    contactName: "Example contact",
    phone: "+252 61 0000000",
    country: "Somalia",
    region: "Banaadir",
    city: "Mogadishu",
    address: null,
    marketAssociation: null,
    submittedAt: "2026-01-01T10:00:00.000Z",
    reviewedAt: null,
    rejectionReason: null,
    informationRequest: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
  };

  if (path.endsWith("/register") || path === "/auth/login" || path.includes("/mfa/verify")) {
    return { data: { user } };
  }
  if (path === "/auth/me") {
    return { data: { user, vendorStatus: "NOT_STARTED" } };
  }
  if (path.endsWith("/logout")) return { data: { loggedOut: true } };
  if (path.endsWith("/admin/auth/email/verify")) {
    return {
      data: {
        challengeId: "example-short-lived-challenge",
        mfaRequired: true,
      },
    };
  }
  if (path.endsWith("/email/verify")) {
    return {
      data: {
        verified: true,
        user: { id: user.id, accountType: user.accountType },
      },
    };
  }
  if (path.endsWith("/password/reset")) return { data: { reset: true } };
  if (path.endsWith("/email/resend") || path.endsWith("/password/forgot") || path.endsWith("/admin/auth/login")) {
    return { data: { accepted: true } };
  }
  if (path.endsWith("/admin/auth/mfa/setup")) return { data: { setup: true } };
  if (path.endsWith("/admin/auth/mfa/enable")) {
    return { data: { user, recoveryCodes: ["<shown-once recovery code>"] } };
  }
  if (path === "/vendor/onboarding") {
    return {
      data: {
        application:
          method === "GET"
            ? null
            : { ...application, applicationStatus: "DRAFT", submittedAt: null },
      },
    };
  }
  if (path === "/vendor/onboarding/status") {
    return {
      data: {
        status: "PENDING",
        verificationStatus: "PENDING",
        submittedAt: application.submittedAt,
        reviewedAt: null,
      },
    };
  }
  if (path === "/admin/vendors/applications") {
    return { data: { applications: [], nextCursor: null } };
  }
  if (path.endsWith("/admin/vendors/applications/{applicationId}")) {
    return { data: { application: { ...application, user } } };
  }
  if (path.includes("/admin/vendors/applications/")) {
    return { data: { application } };
  }
  if (path.includes("/admin/vendors/")) {
    return {
      data: {
        application: { ...application, applicationStatus: "SUSPENDED" },
      },
    };
  }
  if (path.startsWith("/vendor/onboarding")) {
    return {
      data: {
        application: {
          ...application,
          applicationStatus: path.endsWith("/submit") ? "PENDING" : "DRAFT",
        },
      },
    };
  }
  return { data: {} };
}

function errorResponse(description: string, code: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: apiErrorSchema,
        example: {
          error: {
            code,
            message: description,
          },
        },
      },
    },
  };
}

function matchPath(pattern: string, value: string): Params | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const valueParts = value.split("/").filter(Boolean);
  if (patternParts.length !== valueParts.length) return null;

  const params: Params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const valuePart = valueParts[index];
    if (patternPart.startsWith("{") && patternPart.endsWith("}")) {
      params[patternPart.slice(1, -1)] = decodeURIComponent(valuePart);
    } else if (patternPart !== valuePart) {
      return null;
    }
  }
  return params;
}

function openApiMethod(method: HttpMethod): OpenApiMethod {
  const methods: Record<HttpMethod, OpenApiMethod> = {
    GET: "get",
    POST: "post",
    PATCH: "patch",
    DELETE: "delete",
  };
  return methods[method];
}
