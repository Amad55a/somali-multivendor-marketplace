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
  requireUser,
  setSessionCookie,
} from "@/features/auth/sessions";
import {
  adminChallengeSchema,
  adminEmailCodeSchema,
  adminLoginSchema,
  adminMfaEnableSchema,
  adminMfaSetupSchema,
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
} from "@/features/auth/validation/schemas";
import {
  createDraft,
  getApplication,
  getApplicationStatus,
  getOnboarding,
  listApplications,
  reviewApplication,
  submitApplication,
  suspendVendor,
  updateDraft,
} from "@/features/vendors/service";

type HttpMethod = "GET" | "POST" | "PATCH";
type OpenApiMethod = "get" | "post" | "patch";
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
  accountType: z.enum(["CUSTOMER", "VENDOR", "ADMIN"]),
  emailVerified: z.boolean(),
});
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
  address: z.string().nullable(),
  marketAssociation: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
  informationRequest: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
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
    "/admin/vendors/applications",
    ["Admin"],
    "List submitted vendor applications",
    "Authenticated ADMIN",
    success(200, "Paginated vendor applications; drafts are not exposed.", envelope(z.object({
      applications: z.array(applicationSchema.extend({
        user: z.object({ id: z.uuid(), email: z.email() }),
      })),
      nextCursor: z.uuid().nullable(),
    }))),
    async (request) => {
      await requireRole(request, "ADMIN");
      const filters = query(request, applicationListQuerySchema);
      return jsonResponse(await listApplications(filters.status, filters.cursor, filters.limit));
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
        user: z.object({ id: z.uuid(), email: z.email() }),
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
];

export async function dispatchApiRequest(
  request: Request,
  segments: string[],
): Promise<Response> {
  return handleApiRequest(async () => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "POST" && method !== "PATCH") {
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
      "JWT access cookie; HttpOnly and SameSite=Lax, Secure in production. The browser sends the cookie automatically to this same-origin Swagger UI. Cookie name is __Host-marketplace_session in production and marketplace_session in development. Unsafe cookie-authenticated requests require a same-origin Origin header.",
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
        "Versioned marketplace REST API. JWT access credentials are delivered only via the HttpOnly session cookie; no refresh-token system is used.",
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
  };
  return methods[method];
}
