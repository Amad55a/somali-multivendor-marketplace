import type {
  AccountType,
  VendorApplicationStatus,
  VendorProfile,
  VendorApplicationFile,
} from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import type { applicationFieldsSchema } from "@/features/auth/validation/schemas";
import type { z } from "zod";
import {
  isKnownLocation,
  isValidInternationalPhone,
  normalizePhone,
} from "@/features/vendors/data/location-data";
import { removeVendorFile, saveVendorFile } from "@/lib/media/vendor-files";
import { sendVendorApplicationEmail } from "@/features/auth/email";
import type { VendorEmailEvent } from "@/features/auth/email-templates";
import { getAuthConfig } from "@/config/env";
import { createAdminNotification } from "@/features/admin/notifications";

type ApplicationFields = z.infer<typeof applicationFieldsSchema>;
type ReviewAction = "APPROVE" | "REJECT" | "REQUEST_INFORMATION";

function isIdentityVerified(user: Pick<AuthenticatedUser, "emailVerifiedAt" | "hasAmazonIdentity">) {
  return Boolean(user.emailVerifiedAt || user.hasAmazonIdentity);
}

const publicFields = {
  id: true,
  applicationStatus: true,
  verificationStatus: true,
  businessName: true,
  storeName: true,
  businessType: true,
  description: true,
  contactName: true,
  phone: true,
  country: true,
  region: true,
  city: true,
  district: true,
  address: true,
  marketAssociation: true,
  mobileMoneyNumber: true,
  files: {
    select: {
      id: true,
      fileType: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
    },
  },
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  informationRequest: true,
  createdAt: true,
  updatedAt: true,
} as const;

const emailDeliveryFields = {
  id: true,
  event: true,
  recipientEmail: true,
  attemptCount: true,
  sentAt: true,
  lastAttemptAt: true,
  lastError: true,
} as const;

export async function getOnboarding(user: AuthenticatedUser) {
  const application = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: publicFields,
  });
  return { application };
}

export async function uploadApplicationFile(
  user: AuthenticatedUser,
  fileType: "STORE_LOGO" | "BUSINESS_LICENSE",
  file: File,
) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, applicationStatus: true },
  });
  if (
    !profile ||
    !["DRAFT", "CHANGES_REQUESTED"].includes(profile.applicationStatus)
  ) {
    throw new AppError("APPLICATION_NOT_EDITABLE", 409, "This application cannot be edited.");
  }
  const stored = await saveVendorFile(file, fileType);
  try {
    const previous = await prisma.vendorApplicationFile.findUnique({
      where: {
        vendorProfileId_fileType: { vendorProfileId: profile.id, fileType },
      },
      select: { storageKey: true },
    });
    const saved = await prisma.vendorApplicationFile.upsert({
      where: {
        vendorProfileId_fileType: { vendorProfileId: profile.id, fileType },
      },
      create: { vendorProfileId: profile.id, fileType, ...stored },
      update: stored,
      select: {
        id: true,
        fileType: true,
        mimeType: true,
        originalName: true,
        sizeBytes: true,
      },
    });
    if (previous) await removeVendorFile(previous.storageKey);
    return { file: saved };
  } catch (error) {
    await removeVendorFile(stored.storageKey);
    throw error;
  }
}

export async function createDraft(
  user: AuthenticatedUser,
  fields: ApplicationFields,
) {
  if (!isIdentityVerified(user)) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email before onboarding.");
  }

  const existing = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("APPLICATION_ALREADY_EXISTS", 409, "An application already exists.");
  }

  const application = await prisma.$transaction(async (transaction) => {
    const normalizedFields = normalizeApplicationFields(fields);
    validateLocationFields(normalizedFields);
    const created = await transaction.vendorProfile.create({
      data: {
        userId: user.id,
        ...normalizedFields,
        ...(isIdentityVerified(user) ? { verificationStatus: "VERIFIED" } : {}),
      },
      select: publicFields,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "VENDOR_APPLICATION_DRAFT_CREATED",
        entityType: "VendorProfile",
        entityId: created.id,
        metadata: { to: "DRAFT" },
      },
    });
    return created;
  });
  return { application };
}

export async function updateDraft(
  user: AuthenticatedUser,
  fields: ApplicationFields,
) {
  const application = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, applicationStatus: true },
  });
  if (!application) {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  if (
    application.applicationStatus !== "DRAFT" &&
    application.applicationStatus !== "CHANGES_REQUESTED"
  ) {
    throw new AppError(
      "APPLICATION_NOT_EDITABLE",
      409,
      "This application cannot be edited in its current state.",
    );
  }
  const normalizedFields = normalizeApplicationFields(fields);
  validateLocationFields(normalizedFields);

  const updated = await prisma.vendorProfile.update({
    where: { id: application.id },
    data: normalizedFields,
    select: publicFields,
  });
  return { application: updated };
}

export async function submitApplication(user: AuthenticatedUser) {
  if (!isIdentityVerified(user)) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email before onboarding.");
  }

  const result = await prisma.$transaction(async (transaction) => {
    const application = await transaction.vendorProfile.findUnique({
      where: { userId: user.id },
      include: { files: true },
    });
    if (!application) {
      throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
    }
    if (
      application.applicationStatus !== "DRAFT" &&
      application.applicationStatus !== "CHANGES_REQUESTED"
    ) {
      throw new AppError(
        "APPLICATION_NOT_SUBMITTABLE",
        409,
        "This application cannot be submitted in its current state.",
      );
    }
    validateCompleteApplication(application);

    const now = new Date();
    const updated = await transaction.vendorProfile.update({
      where: { id: application.id },
      data: {
        applicationStatus: "PENDING",
        submittedAt: now,
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
        informationRequest: null,
        ...(isIdentityVerified(user) ? { verificationStatus: "VERIFIED" } : {}),
      },
      select: publicFields,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "VENDOR_APPLICATION_SUBMITTED",
        entityType: "VendorProfile",
        entityId: application.id,
        metadata: { from: application.applicationStatus, to: "PENDING" },
      },
    });

    return { application: updated };
  });
  await deliverVendorApplicationEmail(result.application.id, "SUBMITTED", undefined, true, true);
  const storeLabel = result.application.storeName ?? result.application.businessName ?? user.email;
  await createAdminNotification({
    type: "VENDOR_APPLICATION_SUBMITTED",
    title: "New vendor application",
    titleSo: "Codsi iibiye oo cusub",
    body: `${storeLabel} submitted a vendor application for review.`,
    bodySo: `${storeLabel} wuxuu soo gudbiyay codsi iibiye oo dib u eegis u baahan.`,
    href: `/admin/vendors/applications/${result.application.id}`,
    entityType: "VendorProfile",
    entityId: result.application.id,
  });
  return result;
}

export async function getApplicationStatus(user: AuthenticatedUser) {
  if (isIdentityVerified(user)) {
    await prisma.vendorProfile.updateMany({
      where: { userId: user.id, verificationStatus: "UNVERIFIED" },
      data: { verificationStatus: "VERIFIED" },
    });
  }
  const application = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: {
      applicationStatus: true,
      verificationStatus: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      informationRequest: true,
    },
  });
  return {
    status: application?.applicationStatus ?? "NOT_STARTED",
    verificationStatus: isIdentityVerified(user)
      ? "VERIFIED"
      : application?.verificationStatus ?? "UNVERIFIED",
    submittedAt: application?.submittedAt ?? null,
    reviewedAt: application?.reviewedAt ?? null,
    ...(application?.rejectionReason
      ? { rejectionReason: application.rejectionReason }
      : {}),
    ...(application?.informationRequest
      ? { informationRequest: application.informationRequest }
      : {}),
  };
}

export async function listApplications(
  status: VendorApplicationStatus | undefined,
  search: string | undefined,
  cursor: string | undefined,
  limit: number,
) {
  if (status === "DRAFT") return { applications: [], nextCursor: null };

  const normalizedSearch = search?.trim();
  const applications = await prisma.vendorProfile.findMany({
    where: {
      applicationStatus: status ?? { not: "DRAFT" },
      ...(normalizedSearch
        ? {
            OR: [
              { businessName: { contains: normalizedSearch, mode: "insensitive" } },
              { storeName: { contains: normalizedSearch, mode: "insensitive" } },
              { contactName: { contains: normalizedSearch, mode: "insensitive" } },
              {
                user: {
                  is: {
                    email: { contains: normalizedSearch, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
    select: {
      ...publicFields,
      emailDeliveries: { select: emailDeliveryFields, orderBy: { createdAt: "asc" } },
      changeRequests: {
        where: { status: "PENDING" },
        select: { id: true },
        take: 1,
      },
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          authAccounts: {
            where: { provider: "AMAZON" },
            select: { id: true },
          },
        },
      },
    },
  });

  return {
    applications: applications.map(({ user, changeRequests, ...application }) => ({
      ...application,
      pendingProfileChange: changeRequests.length > 0,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        hasAmazonIdentity: user.authAccounts.length > 0,
      },
    })),
    nextCursor: applications.length === limit ? applications.at(-1)?.id ?? null : null,
  };
}

export async function getApplication(applicationId: string) {
  const application = await prisma.vendorProfile.findUnique({
    where: { id: applicationId },
    select: {
      ...publicFields,
      emailDeliveries: { select: emailDeliveryFields, orderBy: { createdAt: "asc" } },
      changeRequests: {
        where: { status: "PENDING" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          proposed: true,
          currentSnapshot: true,
          vendorNote: true,
          adminNote: true,
          submittedAt: true,
          files: {
            select: {
              id: true,
              fileType: true,
              mimeType: true,
              originalName: true,
              sizeBytes: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          displayName: true,
          authAccounts: {
            where: { provider: "AMAZON" },
            select: { id: true },
          },
        },
      },
    },
  });
  if (!application || application.applicationStatus === "DRAFT") {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  return {
    application: {
      ...application,
      pendingChangeRequest: application.changeRequests[0] ?? null,
      changeRequests: undefined,
      user: {
        id: application.user.id,
        email: application.user.email,
        emailVerifiedAt: application.user.emailVerifiedAt,
        displayName: application.user.displayName,
        hasAmazonIdentity: application.user.authAccounts.length > 0,
      },
    },
  };
}

export async function reviewApplication(
  reviewer: AuthenticatedUser,
  applicationId: string,
  action: ReviewAction,
  message?: string,
) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true, applicationStatus: true },
  });
  if (!profile || profile.applicationStatus === "DRAFT") {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }

  const allowed =
    action === "APPROVE"
      ? ["PENDING", "UNDER_REVIEW"]
      : ["PENDING", "UNDER_REVIEW"];
  if (!allowed.includes(profile.applicationStatus)) {
    throw new AppError(
      "INVALID_APPLICATION_TRANSITION",
      409,
      "This application cannot be reviewed in its current state.",
    );
  }

  const targetStatus =
    action === "APPROVE"
      ? "APPROVED"
      : action === "REJECT"
        ? "REJECTED"
        : "CHANGES_REQUESTED";
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    const data = {
      applicationStatus: targetStatus,
      reviewedById: reviewer.id,
      reviewedAt: now,
      rejectionReason: action === "REJECT" ? message : null,
      informationRequest: action === "REQUEST_INFORMATION" ? message : null,
    } as const;
    const updated = await transaction.vendorProfile.updateMany({
      where: {
        id: profile.id,
        applicationStatus: profile.applicationStatus,
      },
      data,
    });
    if (updated.count !== 1) {
      throw new AppError(
        "APPLICATION_CHANGED",
        409,
        "The application changed while it was being reviewed.",
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: reviewer.id,
        action: `VENDOR_APPLICATION_${action}`,
        entityType: "VendorProfile",
        entityId: profile.id,
        metadata: {
          from: profile.applicationStatus,
          to: targetStatus,
          ...(message ? { message } : {}),
        },
      },
    });

    const application = await transaction.vendorProfile.findUniqueOrThrow({
      where: { id: profile.id },
      select: publicFields,
    });
    return { application };
  });
  await deliverVendorApplicationEmail(
    result.application.id,
    action === "APPROVE"
      ? "APPROVED"
      : action === "REJECT"
        ? "REJECTED"
        : "CHANGES_REQUESTED",
    message,
    true,
    true,
  );
  return result;
}

export async function deliverVendorApplicationEmail(
  applicationId: string,
  event: VendorEmailEvent,
  detail?: string,
  force = false,
  reset = false,
) {
  const application = await prisma.vendorProfile.findUnique({
    where: { id: applicationId },
    select: {
      user: { select: { email: true, displayName: true } },
      applicationStatus: true,
    },
  });
  if (!application) return;
  const delivery = await prisma.vendorApplicationEmail.upsert({
    where: { vendorProfileId_event: { vendorProfileId: applicationId, event } },
    create: {
      vendorProfileId: applicationId,
      event,
      recipientEmail: application.user.email,
    },
    update: {
      recipientEmail: application.user.email,
      ...(reset ? { sentAt: null, lastError: null, lastAttemptAt: null } : {}),
    },
  });
  if (delivery.sentAt) return;
  const now = new Date();
  const claimed = await prisma.vendorApplicationEmail.updateMany({
    where: {
      id: delivery.id,
      sentAt: null,
      ...(force || reset
        ? {}
        : {
            OR: [
              { lastAttemptAt: null },
              { lastAttemptAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
            ],
          }),
    },
    data: { attemptCount: { increment: 1 }, lastAttemptAt: now, lastError: null },
  });
  if (claimed.count !== 1) return;
  const updated = await prisma.vendorApplicationEmail.findUniqueOrThrow({
    where: { id: delivery.id },
  });
  try {
    const baseUrl = getAuthConfig().appUrl.replace(/\/$/, "");
    await sendVendorApplicationEmail(
      updated.recipientEmail,
      event,
      application.user.displayName ?? application.user.email.split("@")[0],
      detail,
      `${baseUrl}/en/vendor/status`,
    );
    await prisma.vendorApplicationEmail.update({
      where: { id: updated.id },
      data: { sentAt: new Date(), lastError: null },
    });
  } catch (error) {
    await prisma.vendorApplicationEmail.update({
      where: { id: updated.id },
      data: {
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
      },
    });
    console.error("[vendor-email] Delivery attempt recorded", { event });
  }
}

export async function retryVendorApplicationEmail(
  applicationId: string,
  event: VendorEmailEvent,
) {
  const delivery = await prisma.vendorApplicationEmail.findUnique({
    where: { vendorProfileId_event: { vendorProfileId: applicationId, event } },
    select: { sentAt: true },
  });
  if (!delivery) {
    throw new AppError("EMAIL_DELIVERY_NOT_FOUND", 404, "Email notification was not found.");
  }
  if (delivery.sentAt) {
    throw new AppError("EMAIL_ALREADY_SENT", 409, "This email notification was already accepted by SMTP.");
  }
  await deliverVendorApplicationEmail(applicationId, event, undefined, true);
  return getApplication(applicationId);
}

export async function suspendVendor(
  reviewer: AuthenticatedUser,
  vendorId: string,
  reason: string,
) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: vendorId },
    select: { id: true, applicationStatus: true },
  });
  if (!profile || profile.applicationStatus !== "APPROVED") {
    throw new AppError(
      "VENDOR_NOT_SUSPENDABLE",
      409,
      "Only an approved vendor can be suspended.",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.vendorProfile.updateMany({
      where: { id: profile.id, applicationStatus: "APPROVED" },
      data: {
        applicationStatus: "SUSPENDED",
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new AppError("VENDOR_STATUS_CHANGED", 409, "The vendor status has changed.");
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: reviewer.id,
        action: "VENDOR_SUSPENDED",
        entityType: "VendorProfile",
        entityId: profile.id,
        metadata: { from: "APPROVED", to: "SUSPENDED", reason },
      },
    });

    const application = await transaction.vendorProfile.findUniqueOrThrow({
      where: { id: profile.id },
      select: publicFields,
    });
    return { application };
  });
}

export async function assertApprovedVendor(userId: string, accountType: AccountType) {
  if (accountType !== "VENDOR") {
    throw new AppError("FORBIDDEN", 403, "Vendor access is required.");
  }

  const profile = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: { applicationStatus: true },
  });
  if (profile?.applicationStatus !== "APPROVED") {
    throw new AppError(
      "VENDOR_NOT_APPROVED",
      403,
      "Selling access is available only to approved vendors.",
    );
  }
}

function validateCompleteApplication(
  profile: VendorProfile & { files: VendorApplicationFile[] },
): void {
  const requiredFields = [
    profile.businessName,
    profile.storeName,
    profile.businessType,
    profile.description,
    profile.contactName,
    profile.phone,
    profile.country,
    profile.region,
    profile.city,
    profile.address,
    profile.mobileMoneyNumber,
  ];
  if (requiredFields.some((value) => !value?.trim())) {
    throw new AppError(
      "APPLICATION_INCOMPLETE",
      400,
      "Complete the required business, contact, and location information before submitting.",
    );
  }

  validateLocationFields(profile);
  if (
    !profile.files.some((file) => file.fileType === "STORE_LOGO") ||
    !profile.files.some((file) => file.fileType === "BUSINESS_LICENSE")
  ) {
    throw new AppError(
      "APPLICATION_INCOMPLETE",
      400,
      "Upload a store logo and business licence before submitting.",
    );
  }
  if (
    !profile.mobileMoneyNumber ||
    !isValidInternationalPhone(profile.mobileMoneyNumber)
  ) {
    throw new AppError(
      "INVALID_PAYOUT_NUMBER",
      400,
      "Enter a valid mobile money payout number.",
    );
  }
}

function normalizeApplicationFields(fields: ApplicationFields): ApplicationFields {
  if (!fields.mobileMoneyNumber || fields.mobileMoneyNumber.startsWith("+")) {
    return fields;
  }
  return {
    ...fields,
    mobileMoneyNumber: normalizePhone(fields.country ?? "", fields.mobileMoneyNumber),
  };
}

function validateLocationFields(fields: {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  phone?: string | null;
}): void {
  if (
    fields.country &&
    fields.region &&
    fields.city &&
    !isKnownLocation(fields.country, fields.region, fields.city, fields.district ?? undefined)
  ) {
    throw new AppError("INVALID_LOCATION", 400, "Select a valid country, region, city, and district combination.");
  }
  if (fields.phone && !isValidInternationalPhone(fields.phone)) {
    throw new AppError("INVALID_PHONE", 400, "Enter a valid international phone number for the selected country.");
  }
}
