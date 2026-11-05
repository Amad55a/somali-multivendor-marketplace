import type {
  AccountType,
  VendorApplicationStatus,
  VendorProfile,
} from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import type { applicationFieldsSchema } from "@/features/auth/validation/schemas";
import type { z } from "zod";

type ApplicationFields = z.infer<typeof applicationFieldsSchema>;
type ReviewAction = "APPROVE" | "REJECT" | "REQUEST_INFORMATION";

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
  address: true,
  marketAssociation: true,
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  informationRequest: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getOnboarding(user: AuthenticatedUser) {
  const application = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: publicFields,
  });
  return { application };
}

export async function createDraft(
  user: AuthenticatedUser,
  fields: ApplicationFields,
) {
  if (!user.emailVerifiedAt && !user.hasAmazonIdentity) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email before onboarding.");
  }

  const existing = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("APPLICATION_ALREADY_EXISTS", 409, "An application already exists.");
  }

  const application = await prisma.vendorProfile.create({
    data: { userId: user.id, ...fields },
    select: publicFields,
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
    application.applicationStatus !== "NEEDS_INFORMATION"
  ) {
    throw new AppError(
      "APPLICATION_NOT_EDITABLE",
      409,
      "This application cannot be edited in its current state.",
    );
  }

  const updated = await prisma.vendorProfile.update({
    where: { id: application.id },
    data: fields,
    select: publicFields,
  });
  return { application: updated };
}

export async function submitApplication(user: AuthenticatedUser) {
  if (!user.emailVerifiedAt && !user.hasAmazonIdentity) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Verify your email before onboarding.");
  }

  return prisma.$transaction(async (transaction) => {
    const application = await transaction.vendorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!application) {
      throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
    }
    if (
      application.applicationStatus !== "DRAFT" &&
      application.applicationStatus !== "NEEDS_INFORMATION"
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
}

export async function getApplicationStatus(user: AuthenticatedUser) {
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
    verificationStatus: application?.verificationStatus ?? "UNVERIFIED",
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
  cursor: string | undefined,
  limit: number,
) {
  if (status === "DRAFT") return { applications: [], nextCursor: null };

  const applications = await prisma.vendorProfile.findMany({
    where: status
      ? { applicationStatus: status }
      : { applicationStatus: { not: "DRAFT" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
    select: {
      ...publicFields,
      user: { select: { id: true, email: true } },
    },
  });

  return {
    applications,
    nextCursor: applications.length === limit ? applications.at(-1)?.id ?? null : null,
  };
}

export async function getApplication(applicationId: string) {
  const application = await prisma.vendorProfile.findUnique({
    where: { id: applicationId },
    select: {
      ...publicFields,
      user: { select: { id: true, email: true } },
    },
  });
  if (!application || application.applicationStatus === "DRAFT") {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  return { application };
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
        : "NEEDS_INFORMATION";
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
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

function validateCompleteApplication(profile: VendorProfile): void {
  const requiredFields = [
    profile.businessName,
    profile.storeName,
    profile.businessType,
    profile.contactName,
    profile.phone,
    profile.country,
    profile.region,
    profile.city,
  ];
  if (requiredFields.some((value) => !value?.trim())) {
    throw new AppError(
      "APPLICATION_INCOMPLETE",
      400,
      "Complete the required business, contact, and location information before submitting.",
    );
  }
}
