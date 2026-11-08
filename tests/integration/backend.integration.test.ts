import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mailbox = vi.hoisted(() => ({
  messages: [] as Array<{
    email: string;
    code: string;
    purpose: string;
  }>,
  vendorMessages: [] as Array<{
    email: string;
    event: string;
    displayName: string;
    detail?: string;
  }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/email", () => ({
  assertEmailDeliveryConfigured: vi.fn(),
  sendOneTimeCode: vi.fn(
    async (email: string, code: string, purpose: string) => {
      mailbox.messages.push({ email, code, purpose });
    },
  ),
  sendVendorApplicationEmail: vi.fn(
    async (email: string, event: string, displayName: string, detail?: string) => {
      mailbox.vendorMessages.push({
        email,
        event,
        displayName,
        ...(detail ? { detail } : {}),
      });
    },
  ),
}));

import type { AccountType } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchApiRequest } from "@/lib/api/v1";
import { getClientIp } from "@/lib/api/requests";
import {
  completeAmazonLogin,
  startAmazonLogin,
} from "@/features/auth/amazon";
import { setPendingEmailVerificationCookie } from "@/features/auth/pending-email-verification";
import {
  beginAdminLogin,
  enableAdminMfa,
  setupAdminMfa,
  verifyAdminEmail,
  verifyAdminMfa,
} from "@/features/auth/admin-service";
import {
  register,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/features/auth/service";
import {
  createSession,
  requireUser,
  type AuthenticatedUser,
} from "@/features/auth/sessions";
import { enforceRateLimit, hashSecret } from "@/features/auth/security";
import { hashPassword } from "@/features/auth/passwords";
import {
  assertApprovedVendor,
  createDraft,
  getApplicationStatus,
  reviewApplication,
  submitApplication,
  suspendVendor,
  updateDraft,
} from "@/features/vendors/service";

const userIds: string[] = [];
const entityIds: string[] = [];
const rateLimitHashes: string[] = [];

beforeEach(() => {
  mailbox.messages.length = 0;
  mailbox.vendorMessages.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  if (entityIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: entityIds } },
    });
  }
  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (rateLimitHashes.length > 0) {
    await prisma.loginAttempt.deleteMany({
      where: { identifier: { in: rateLimitHashes } },
    });
  }
  await prisma.$disconnect();
});

describe("customer and vendor authentication", () => {
  it("verifies the registration-bound account, creates a session, and resends only to its email", async () => {
    const email = uniqueEmail();
    const registration = await register(
      "CUSTOMER",
      email,
      "customer-password-long-enough",
    );
    userIds.push(registration.user.id);
    const cookieResponse = setPendingEmailVerificationCookie(
      Response.json({}),
      registration.user.id,
      "CUSTOMER",
    );
    const pendingCookie = cookieResponse.headers.get("set-cookie");
    if (!pendingCookie) throw new Error("Pending verification cookie was not set.");
    const cookie = pendingCookie.split(";")[0];

    vi.stubEnv("RECAPTCHA_SECRET_KEY", "integration-recaptcha-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          success: true,
          score: 0.9,
          action: "email_resend",
          hostname: "localhost",
        }),
      ),
    );
    const resend = await dispatchApiRequest(
      new Request("http://localhost:3000/api/v1/auth/email/resend", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ recaptchaToken: "mock-token" }),
      }),
      ["auth", "email", "resend"],
    );
    expect(resend.status).toBe(202);
    expect(mailbox.messages.at(-1)).toMatchObject({
      email,
      purpose: "EMAIL_VERIFY",
    });
    const invalidResend = await dispatchApiRequest(
      new Request("http://localhost:3000/api/v1/auth/email/resend", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "someone-else@example.test",
          accountType: "VENDOR",
          recaptchaToken: "mock-token",
        }),
      }),
      ["auth", "email", "resend"],
    );
    expect(invalidResend.status).toBe(400);

    const code = lastCode(email, "EMAIL_VERIFY");
    const verification = await dispatchApiRequest(
      new Request("http://localhost:3000/api/v1/auth/email/verify", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ code }),
      }),
      ["auth", "email", "verify"],
    );
    expect(verification.status).toBe(200);
    expect(verification.headers.get("set-cookie")).toContain("marketplace_session=");
    expect(verification.headers.get("set-cookie")).toContain(
      "marketplace_pending_email_verification=; HttpOnly",
    );
    const result = await verification.json();
    expect(result.data).toMatchObject({
      verified: true,
      user: {
        id: registration.user.id,
        accountType: "CUSTOMER",
      },
    });
    const sessionToken = /marketplace_session=([^;,]+)/.exec(
      verification.headers.get("set-cookie") ?? "",
    )?.[1];
    if (!sessionToken) throw new Error("Verified session cookie was not set.");
    await expect(
      requireUser(sessionRequest(sessionToken), ["CUSTOMER"]),
    ).resolves.toMatchObject({
      id: registration.user.id,
      emailVerifiedAt: expect.any(Date),
    });
  });

  it("keeps same-email account types separate, verifies OTP, resets passwords, and revokes sessions", async () => {
    const email = uniqueEmail();
    const password = "customer-password-long-enough";
    const customer = await register("CUSTOMER", email, password);
    userIds.push(customer.user.id);
    const customerOtp = lastCode(email, "EMAIL_VERIFY");
    const vendor = await register("VENDOR", email, "vendor-password-long-enough");
    userIds.push(vendor.user.id);
    const vendorOtp = lastCode(email, "EMAIL_VERIFY");

    expect(customer.user.id).not.toBe(vendor.user.id);
    expect(customer.user.accountType).toBe("CUSTOMER");
    expect(vendor.user.accountType).toBe("VENDOR");
    const storedOtp = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { userId: customer.user.id, purpose: "EMAIL_VERIFY" },
    });
    expect(storedOtp.codeHash).not.toBe(customerOtp);
    expect(storedOtp.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await verifyEmail(customer.user.id, "CUSTOMER", customerOtp);
    await verifyEmail(vendor.user.id, "VENDOR", vendorOtp);

    const [customerLogin, vendorLogin] = await Promise.all([
      login(email, password, "CUSTOMER"),
      login(email, "vendor-password-long-enough", "VENDOR"),
    ]);
    expect(customerLogin.user.id).not.toBe(vendorLogin.user.id);

    const amazonId = `amazon-${randomUUID()}`;
    await connectAmazonIdentity(customer.user.id, "CUSTOMER", amazonId);
    await connectAmazonIdentity(vendor.user.id, "VENDOR", amazonId);
    const amazonAccounts = await prisma.userAuthAccount.findMany({
      where: { provider: "AMAZON", providerAccountId: amazonId },
      include: { user: { select: { accountType: true } } },
    });
    expect(amazonAccounts.map((account) => account.user.accountType).sort()).toEqual([
      "CUSTOMER",
      "VENDOR",
    ]);

    const customerRequest = sessionRequest(customerLogin.session.token);
    const principal = await requireUser(customerRequest, ["CUSTOMER"]);
    await logout(customerRequest, principal);
    await expect(requireUser(customerRequest)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    const expiringSession = await createSession({
      id: vendor.user.id,
      accountType: "VENDOR",
    });
    const vendorSessionRequest = sessionRequest(expiringSession.token);
    await prisma.userSession.updateMany({
      where: { userId: vendor.user.id, revokedAt: null },
      data: { expiresAt: new Date(0) },
    });
    await expect(requireUser(vendorSessionRequest)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    const resetSession = await login(email, password, "CUSTOMER");
    await requestPasswordReset(email, "CUSTOMER");
    const resetCode = lastCode(email, "PASSWORD_RESET");
    const resetOtp = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { userId: customer.user.id, purpose: "PASSWORD_RESET" },
    });
    expect(resetOtp.codeHash).not.toBe(resetCode);

    await resetPassword(
      email,
      "CUSTOMER",
      resetCode,
      "new-customer-password-long-enough",
    );
    await expect(login(email, password, "CUSTOMER")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(
      requireUser(sessionRequest(resetSession.session.token)),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      login(email, "new-customer-password-long-enough", "CUSTOMER"),
    ).resolves.toMatchObject({ user: { id: customer.user.id } });
  });

  it("rejects expired email OTPs and does not permit account-type confusion", async () => {
    const email = uniqueEmail();
    const registration = await register("CUSTOMER", email, "customer-password-long-enough");
    userIds.push(registration.user.id);
    const code = lastCode(email, "EMAIL_VERIFY");
    await prisma.emailVerificationCode.updateMany({
      where: { userId: registration.user.id, purpose: "EMAIL_VERIFY" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      verifyEmail(registration.user.id, "CUSTOMER", code),
    ).rejects.toMatchObject({
      code: "INVALID_VERIFICATION_CODE",
    });
    await expect(
      login(email, "customer-password-long-enough", "VENDOR"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("administrator authentication and MFA", () => {
  it("requires email OTP and TOTP, encrypts the secret, and consumes recovery codes once", async () => {
    const admin = await createAdmin(uniqueEmail());
    const otherAdmin = await createAdmin(uniqueEmail());
    const secret = new OTPAuth.Secret({ size: 20 }).base32;

    await beginAdminLogin(admin.email, "admin-password-long-enough");
    const firstEmailCode = lastCode(admin.email, "ADMIN_LOGIN");
    await expect(
      verifyAdminEmail(otherAdmin.email, firstEmailCode),
    ).rejects.toMatchObject({ code: "INVALID_ADMIN_CHALLENGE" });
    const setupChallenge = await verifyAdminEmail(admin.email, firstEmailCode);
    expect(setupChallenge.mfaRequired).toBe(false);
    await setupAdminMfa(setupChallenge.challengeId, secret);

    const storedMethod = await prisma.adminMfaMethod.findUniqueOrThrow({
      where: { userId: admin.id },
    });
    expect(storedMethod.encryptedSecret).not.toContain(secret);
    expect(storedMethod.enabled).toBe(false);

    const totp = new OTPAuth.TOTP({
      issuer: "Somsuuq",
      label: admin.email,
      secret: OTPAuth.Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    });
    const enrollment = await enableAdminMfa(
      setupChallenge.challengeId,
      totp.generate(),
    );
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(enrollment.recoveryCodes[0]).toMatch(/^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);

    const storedRecoveryCodes = await prisma.adminRecoveryCode.findMany({
      where: { userId: admin.id },
    });
    expect(storedRecoveryCodes).toHaveLength(10);
    expect(storedRecoveryCodes.map((item) => item.codeHash)).not.toContain(
      enrollment.recoveryCodes[0],
    );
    expect(
      await prisma.adminMfaMethod.findUniqueOrThrow({ where: { userId: admin.id } }),
    ).toMatchObject({ enabled: true });

    await beginAdminLogin(admin.email, "admin-password-long-enough");
    const secondEmailCode = lastCode(admin.email, "ADMIN_LOGIN");
    const secondChallenge = await verifyAdminEmail(admin.email, secondEmailCode);
    expect(secondChallenge.mfaRequired).toBe(true);

    const otherTotp = new OTPAuth.TOTP({
      issuer: "Somsuuq",
      label: otherAdmin.email,
      secret: new OTPAuth.Secret({ size: 20 }),
      digits: 6,
      period: 30,
    });
    await expect(
      verifyAdminMfa(
        secondChallenge.challengeId,
        totp.generate({ timestamp: Date.now() - 2 * 60 * 1000 }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });
    await expect(
      verifyAdminMfa(secondChallenge.challengeId, otherTotp.generate()),
    ).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });

    const configuredKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;
    if (!configuredKey) throw new Error("Integration MFA key was not configured.");
    vi.stubEnv("ADMIN_MFA_ENCRYPTION_KEY", "f".repeat(64));
    await expect(
      verifyAdminMfa(secondChallenge.challengeId, totp.generate()),
    ).rejects.toMatchObject({
      code: "ADMIN_MFA_SECRET_UNAVAILABLE",
      status: 503,
    });
    vi.stubEnv("ADMIN_MFA_ENCRYPTION_KEY", configuredKey);

    const secondLogin = await verifyAdminMfa(
      secondChallenge.challengeId,
      totp.generate(),
    );
    const secondSessionRequest = sessionRequest(secondLogin.session.token);
    const authenticatedAdmin = await requireUser(secondSessionRequest, ["ADMIN"]);
    expect(authenticatedAdmin.id).toBe(admin.id);

    await beginAdminLogin(admin.email, "admin-password-long-enough");
    const recoveryEmailCode = lastCode(admin.email, "ADMIN_LOGIN");
    const recoveryChallenge = await verifyAdminEmail(admin.email, recoveryEmailCode);
    const recoveryLogin = await verifyAdminMfa(
      recoveryChallenge.challengeId,
      enrollment.recoveryCodes[0],
    );

    await beginAdminLogin(admin.email, "admin-password-long-enough");
    const replayEmailCode = lastCode(admin.email, "ADMIN_LOGIN");
    const replayChallenge = await verifyAdminEmail(admin.email, replayEmailCode);
    await expect(
      verifyAdminMfa(replayChallenge.challengeId, enrollment.recoveryCodes[0]),
    ).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });

    const recoveryAdmin = await requireUser(
      sessionRequest(recoveryLogin.session.token),
      ["ADMIN"],
    );
    await prisma.userSession.update({
      where: { id: recoveryAdmin.sessionId },
      data: { lastActivityAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const expiredAdmin = await prisma.userSession.findUniqueOrThrow({
      where: { id: recoveryAdmin.sessionId },
    });
    expect(expiredAdmin.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(
      requireUser(sessionRequest(recoveryLogin.session.token)),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const revokedAdmin = await prisma.userSession.findUniqueOrThrow({
      where: { id: recoveryAdmin.sessionId },
    });
    expect(revokedAdmin.revokedAt).toBeInstanceOf(Date);
  });
});

describe("vendor onboarding and admin review", () => {
  it("blocks pending and suspended selling access and audits review transitions", async () => {
    const reviewer = await createAdmin(uniqueEmail());
    const reviewerPrincipal = principal(reviewer.id, reviewer.email, "ADMIN");
    const pendingVendor = await createVerifiedVendor();
    const pending = await createCompleteDraft(pendingVendor, "Pending Store");
    entityIds.push(pending.application.id);
    await submitApplication(pendingVendor);

    await expect(
      assertApprovedVendor(pendingVendor.id, "VENDOR"),
    ).rejects.toMatchObject({ code: "VENDOR_NOT_APPROVED" });

    await reviewApplication(
      reviewerPrincipal,
      pending.application.id,
      "REQUEST_INFORMATION",
      "Please provide a clearer store description.",
    );
    await updateDraft(pendingVendor, { description: "Updated business description." });
    await submitApplication(pendingVendor);
    await reviewApplication(
      reviewerPrincipal,
      pending.application.id,
      "REJECT",
      "Business details could not be confirmed.",
    );
    await expect(assertApprovedVendor(pendingVendor.id, "VENDOR")).rejects.toMatchObject({
      code: "VENDOR_NOT_APPROVED",
    });

    const approvedVendor = await createVerifiedVendor();
    const application = await createCompleteDraft(approvedVendor, "Approved Store");
    entityIds.push(application.application.id);
    await submitApplication(approvedVendor);
    await reviewApplication(
      reviewerPrincipal,
      application.application.id,
      "APPROVE",
    );
    await expect(
      assertApprovedVendor(approvedVendor.id, "VENDOR"),
    ).resolves.toBeUndefined();

    await suspendVendor(
      reviewerPrincipal,
      approvedVendor.id,
      "Policy review required.",
    );
    await expect(
      assertApprovedVendor(approvedVendor.id, "VENDOR"),
    ).rejects.toMatchObject({ code: "VENDOR_NOT_APPROVED" });

    const status = await getApplicationStatus(pendingVendor);
    expect(status).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Business details could not be confirmed.",
    });

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityId: { in: [pending.application.id, application.application.id] } },
      select: { action: true },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "VENDOR_APPLICATION_SUBMITTED",
        "VENDOR_APPLICATION_REQUEST_INFORMATION",
        "VENDOR_APPLICATION_REJECT",
        "VENDOR_APPLICATION_APPROVE",
        "VENDOR_SUSPENDED",
      ]),
    );
    expect(mailbox.vendorMessages.map(({ event }) => event)).toEqual([
      "SUBMITTED",
      "CHANGES_REQUESTED",
      "SUBMITTED",
      "REJECTED",
      "SUBMITTED",
      "APPROVED",
    ]);
    expect(mailbox.vendorMessages.find(({ event }) => event === "REJECTED")).toMatchObject({
      email: pendingVendor.email,
      detail: "Business details could not be confirmed.",
    });

    const notifications = await prisma.adminNotification.findMany({
      where: { entityId: { in: [pending.application.id, application.application.id] } },
      select: { entityId: true, type: true, readAt: true },
    });
    const notificationSummary = notifications
      .map(({ entityId, type, readAt }) => ({ entityId, type, readAt }))
      .sort((left, right) =>
        (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
        left.type.localeCompare(right.type),
      );
    const expectedNotifications = [
      {
        entityId: pending.application.id,
        type: "VENDOR_APPLICATION_SUBMITTED",
        readAt: null,
      },
      {
        entityId: pending.application.id,
        type: "VENDOR_APPLICATION_SUBMITTED",
        readAt: null,
      },
      {
        entityId: application.application.id,
        type: "VENDOR_APPLICATION_SUBMITTED",
        readAt: null,
      },
    ].sort((left, right) =>
      (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
      left.type.localeCompare(right.type),
    );
    expect(notificationSummary).toEqual(expectedNotifications);
  });

  it("protects admin routes from missing and customer sessions", async () => {
    const vendor = await createVerifiedVendor();
    const customer = await createVerifiedCustomer();
    const customerSession = await createSession({
      id: customer.id,
      accountType: "CUSTOMER",
    });
    const path = ["admin", "vendors", "applications"];

    const anonymous = await dispatchApiRequest(
      new Request("http://localhost/api/v1/admin/vendors/applications"),
      path,
    );
    const wrongRole = await dispatchApiRequest(
      new Request("http://localhost/api/v1/admin/vendors/applications", {
        headers: { cookie: `marketplace_session=${customerSession.token}` },
      }),
      path,
    );

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
    await expect(assertApprovedVendor(vendor.id, "CUSTOMER")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Amazon OAuth and rate limiting", () => {
  it("mocks Amazon token/profile calls and keeps one provider identity separate by role", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://localhost:3000");
    vi.stubEnv("AMAZON_CLIENT_ID", "test-client");
    vi.stubEnv("AMAZON_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "AMAZON_REDIRECT_URI",
      "https://localhost:3000/api/v1/auth/amazon/callback",
    );
    const email = uniqueEmail();
    const amazonId = `amazon-${randomUUID()}`;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const customerCallback = await completeAmazonFlow(
      "CUSTOMER",
      email,
      amazonId,
      fetchMock,
    );
    expect(customerCallback.status).toBe(303);
    expect(customerCallback.headers.get("location")).toContain("/en/customer/dashboard");
    expect(customerCallback.headers.get("set-cookie")).toContain("marketplace_session=");

    const customer = await prisma.user.findUniqueOrThrow({
      where: {
        accountType_normalizedEmail: {
          accountType: "CUSTOMER",
          normalizedEmail: email,
        },
      },
    });
    userIds.push(customer.id);
    expect(customer.emailVerifiedAt).toBeInstanceOf(Date);

    const customerLogin = await completeAmazonFlow(
      "CUSTOMER",
      email,
      amazonId,
      fetchMock,
    );
    expect(customerLogin.headers.get("set-cookie")).toContain("marketplace_session=");
    expect(customerLogin.headers.get("location")).toContain("/en/customer/dashboard");

    const vendorCallback = await completeAmazonFlow(
      "VENDOR",
      email,
      amazonId,
      fetchMock,
    );
    expect(vendorCallback.headers.get("location")).toContain("/en/vendor/onboarding");
    expect(vendorCallback.headers.get("set-cookie")).toContain("marketplace_session=");
    const vendor = await prisma.user.findUniqueOrThrow({
      where: {
        accountType_normalizedEmail: {
          accountType: "VENDOR",
          normalizedEmail: email,
        },
      },
    });
    userIds.push(vendor.id);
    expect(vendor.emailVerifiedAt).toBeInstanceOf(Date);

    const identities = await prisma.userAuthAccount.findMany({
      where: { provider: "AMAZON", providerAccountId: amazonId },
      include: { user: { select: { accountType: true } } },
    });
    expect(identities.map((identity) => identity.user.accountType).sort()).toEqual([
      "CUSTOMER",
      "VENDOR",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("enforces database-backed limits across repeated requests", async () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
    });
    const identifier = uniqueEmail();
    rateLimitHashes.push(
      hashSecret(
        `integration-rate-limit:ip:${getClientIp(request)}`,
        "rate-limit",
      ),
      hashSecret(
        `integration-rate-limit:identifier:${identifier}`,
        "rate-limit",
      ),
    );

    await enforceRateLimit(request, "integration-rate-limit", identifier, 3, 60);
    await enforceRateLimit(request, "integration-rate-limit", identifier, 3, 60);
    await enforceRateLimit(request, "integration-rate-limit", identifier, 3, 60);
    await expect(
      enforceRateLimit(request, "integration-rate-limit", identifier, 3, 60),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

async function createVerifiedVendor(): Promise<AuthenticatedUser> {
  const account = await createVerifiedAccount("VENDOR", uniqueEmail());
  return principal(account.id, account.email, "VENDOR");
}

async function createCompleteDraft(user: AuthenticatedUser, storeName: string) {
  const draft = await createDraft(user, completeApplication(storeName));
  await prisma.vendorApplicationFile.createMany({
    data: [
      {
        vendorProfileId: draft.application.id,
        fileType: "STORE_LOGO",
        storageKey: `integration/${randomUUID()}/store-logo.png`,
        originalName: "store-logo.png",
        mimeType: "image/png",
        sizeBytes: 1,
      },
      {
        vendorProfileId: draft.application.id,
        fileType: "BUSINESS_LICENSE",
        storageKey: `integration/${randomUUID()}/business-license.pdf`,
        originalName: "business-license.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
      },
    ],
  });
  return draft;
}

async function createVerifiedCustomer() {
  return createVerifiedAccount("CUSTOMER", uniqueEmail());
}

async function createVerifiedAccount(
  accountType: "CUSTOMER" | "VENDOR",
  email: string,
) {
  const registration = await register(accountType, email, "account-password-long-enough");
  userIds.push(registration.user.id);
  await verifyEmail(registration.user.id, accountType, lastCode(email, "EMAIL_VERIFY"));
  return prisma.user.findUniqueOrThrow({ where: { id: registration.user.id } });
}

async function createAdmin(email: string) {
  const admin = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      accountType: "ADMIN",
      emailVerifiedAt: new Date(),
      authAccounts: {
        create: {
          provider: "LOCAL",
          passwordHash: await hashPassword("admin-password-long-enough"),
        },
      },
    },
  });
  userIds.push(admin.id);
  return admin;
}

function principal(
  id: string,
  email: string,
  accountType: AccountType,
): AuthenticatedUser {
  return {
    id,
    email,
    accountType,
    emailVerifiedAt: new Date(),
    hasAmazonIdentity: false,
    sessionId: randomUUID(),
  };
}

function completeApplication(storeName: string) {
  return {
    businessName: `${storeName} Ltd`,
    storeName,
    businessType: "Retail",
    description: "A local business selling verified goods.",
    contactName: "Business Owner",
    phone: "+252611234567",
    country: "Somalia",
    region: "Banaadir",
    city: "Mogadishu",
    address: "Market district",
    marketAssociation: "Local market",
    mobileMoneyNumber: "+252611234567",
  };
}

function uniqueEmail(): string {
  return `integration-${randomUUID()}@example.test`;
}

function lastCode(email: string, purpose: string): string {
  const message = mailbox.messages
    .filter((entry) => entry.email === email && entry.purpose === purpose)
    .at(-1);
  if (!message) throw new Error("Expected a mocked email code to be sent.");
  return message.code;
}

function sessionRequest(token: string): Request {
  return new Request("http://localhost/api/v1/auth/me", {
    headers: { cookie: `marketplace_session=${token}` },
  });
}

async function connectAmazonIdentity(
  userId: string,
  accountType: "CUSTOMER" | "VENDOR",
  providerAccountId: string,
) {
  await prisma.userAuthAccount.create({
    data: {
      provider: "AMAZON",
      providerAccountId,
      user: {
        connect: {
          id_accountType: { id: userId, accountType },
        },
      },
    },
  });
}

async function completeAmazonFlow(
  accountType: "CUSTOMER" | "VENDOR",
  email: string,
  amazonId: string,
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
): Promise<Response> {
  const start = startAmazonLogin(accountType);
  const location = start.headers.get("location");
  if (!location) throw new Error("Amazon authorization URL was not generated.");
  const state = new URL(location).searchParams.get("state");
  if (!state) throw new Error("Amazon OAuth state was not generated.");
  const cookie = start.headers
    .get("set-cookie")
    ?.split(/,\s*(?=[^;,]+=)/)
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("Amazon OAuth state cookie was not set.");

  fetchMock
    .mockResolvedValueOnce(Response.json({ access_token: "mock-access-token" }))
    .mockResolvedValueOnce(
      Response.json({ user_id: amazonId, email, name: "Marketplace User" }),
    );

  return completeAmazonLogin(
    new Request(
      `http://localhost:3000/api/v1/auth/amazon/callback?code=mock-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    ),
  );
}
