import type { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import type { profileChangeFieldsSchema } from "@/features/auth/validation/schemas";
import type { z } from "zod";
import { removeVendorFile, saveVendorFile } from "@/lib/media/vendor-files";
import {
  assertApprovedVendor,
  deliverVendorApplicationEmail,
} from "@/features/vendors/service";
import { createAdminNotification } from "@/features/admin/notifications";
import {
  isKnownLocation,
  isValidInternationalPhone,
  normalizePhone,
} from "@/features/vendors/data/location-data";

type ProfileChangeInput = z.infer<typeof profileChangeFieldsSchema>;

const changeFileSelect = {
  id: true,
  fileType: true,
  mimeType: true,
  originalName: true,
  sizeBytes: true,
} as const;

const changeRequestSelect = {
  id: true,
  status: true,
  proposed: true,
  currentSnapshot: true,
  vendorNote: true,
  adminNote: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  files: { select: changeFileSelect },
} as const;

const profileFieldKeys = [
  "displayName",
  "businessName",
  "storeName",
  "businessType",
  "description",
  "contactName",
  "phone",
  "country",
  "region",
  "city",
  "district",
  "address",
  "marketAssociation",
  "mobileMoneyNumber",
] as const;

export type ProfileFieldKey = (typeof profileFieldKeys)[number];

export async function getVendorProfileChange(user: AuthenticatedUser) {
  await assertApprovedVendor(user.id, user.accountType);
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      changeRequests: {
        where: { status: { in: ["DRAFT", "PENDING"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: changeRequestSelect,
      },
    },
  });
  return { changeRequest: profile?.changeRequests[0] ?? null };
}

export async function submitProfileChange(
  user: AuthenticatedUser,
  input: ProfileChangeInput,
) {
  await assertApprovedVendor(user.id, user.accountType);
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    include: {
      files: true,
      user: { select: { displayName: true } },
      changeRequests: {
        where: { status: { in: ["DRAFT", "PENDING"] } },
        include: { files: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!profile) {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  const existing = profile.changeRequests[0];
  if (existing?.status === "PENDING") {
    throw new AppError(
      "PROFILE_CHANGE_PENDING",
      409,
      "A profile change request is already waiting for review.",
    );
  }

  const snapshot = currentSnapshot(profile);
  const proposed = buildProposed(snapshot, normalizeChangeFields(input));
  if (Object.keys(proposed).length === 0 && (!existing || existing.files.length === 0)) {
    throw new AppError(
      "PROFILE_CHANGE_EMPTY",
      400,
      "Change at least one profile field or upload a new logo before submitting.",
    );
  }
  validateProposed(proposed);

  const changeRequest = await prisma.$transaction(async (transaction) => {
    const saved = existing
      ? await transaction.vendorProfileChangeRequest.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            proposed,
            currentSnapshot: snapshot,
            vendorNote: input.vendorNote ?? null,
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            adminNote: null,
          },
          select: changeRequestSelect,
        })
      : await transaction.vendorProfileChangeRequest.create({
          data: {
            vendorProfileId: profile.id,
            status: "PENDING",
            proposed,
            currentSnapshot: snapshot,
            vendorNote: input.vendorNote ?? null,
            submittedAt: new Date(),
          },
          select: changeRequestSelect,
        });
    await transaction.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "VENDOR_PROFILE_CHANGE_SUBMITTED",
        entityType: "VendorProfileChangeRequest",
        entityId: saved.id,
        metadata: { fields: Object.keys(proposed) },
      },
    });
    return saved;
  });

  await deliverVendorApplicationEmail(
    profile.id,
    "PROFILE_CHANGE_SUBMITTED",
    summarizeProposed(proposed, changeRequest.files.map((file) => file.fileType)),
    true,
    true,
  );
  await createAdminNotification({
    type: "VENDOR_PROFILE_CHANGE_SUBMITTED",
    title: "Vendor profile change request",
    titleSo: "Codsi beddelka profile-ka iibiyaha",
    body: `${profile.storeName ?? profile.businessName ?? "A vendor"} submitted store profile changes for review.`,
    bodySo: `${profile.storeName ?? profile.businessName ?? "Iibiye"} wuxuu soo gudbiyay beddelka profile-ka dukaanka.`,
    href: `/admin/vendors/applications/${profile.id}`,
    entityType: "VendorProfileChangeRequest",
    entityId: changeRequest.id,
  });
  return { changeRequest };
}

export async function saveProfileChangeDraft(
  user: AuthenticatedUser,
  input: ProfileChangeInput,
) {
  await assertApprovedVendor(user.id, user.accountType);
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    include: {
      files: true,
      user: { select: { displayName: true } },
      changeRequests: {
        where: { status: { in: ["DRAFT", "PENDING"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!profile) {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  if (profile.changeRequests[0]?.status === "PENDING") {
    throw new AppError(
      "PROFILE_CHANGE_PENDING",
      409,
      "A profile change request is already waiting for review.",
    );
  }
  const snapshot = currentSnapshot(profile);
  const proposed = buildProposed(snapshot, normalizeChangeFields(input));
  const existing = profile.changeRequests[0];
  const saved = existing
    ? await prisma.vendorProfileChangeRequest.update({
        where: { id: existing.id },
        data: {
          proposed,
          currentSnapshot: snapshot,
          vendorNote: input.vendorNote ?? null,
        },
        select: changeRequestSelect,
      })
    : await prisma.vendorProfileChangeRequest.create({
        data: {
          vendorProfileId: profile.id,
          proposed,
          currentSnapshot: snapshot,
          vendorNote: input.vendorNote ?? null,
        },
        select: changeRequestSelect,
      });
  return { changeRequest: saved };
}

export async function uploadProfileChangeFile(
  user: AuthenticatedUser,
  fileType: "STORE_LOGO" | "BUSINESS_LICENSE",
  file: File,
) {
  await assertApprovedVendor(user.id, user.accountType);
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: user.id },
    include: {
      files: true,
      user: { select: { displayName: true } },
      changeRequests: {
        where: { status: { in: ["DRAFT", "PENDING"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!profile) {
    throw new AppError("APPLICATION_NOT_FOUND", 404, "Vendor application was not found.");
  }
  if (profile.changeRequests[0]?.status === "PENDING") {
    throw new AppError(
      "PROFILE_CHANGE_PENDING",
      409,
      "A profile change request is already waiting for review.",
    );
  }
  let requestId = profile.changeRequests[0]?.id;
  if (!requestId) {
    const created = await prisma.vendorProfileChangeRequest.create({
      data: {
        vendorProfileId: profile.id,
        proposed: {},
        currentSnapshot: currentSnapshot(profile),
      },
      select: { id: true },
    });
    requestId = created.id;
  }
  const stored = await saveVendorFile(file, fileType);
  try {
    const previous = await prisma.vendorProfileChangeFile.findUnique({
      where: { changeRequestId_fileType: { changeRequestId: requestId, fileType } },
      select: { storageKey: true },
    });
    const saved = await prisma.vendorProfileChangeFile.upsert({
      where: { changeRequestId_fileType: { changeRequestId: requestId, fileType } },
      create: { changeRequestId: requestId, fileType, ...stored },
      update: stored,
      select: changeFileSelect,
    });
    if (previous) await removeVendorFile(previous.storageKey);
    const changeRequest = await prisma.vendorProfileChangeRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: changeRequestSelect,
    });
    return { file: saved, changeRequest };
  } catch (error) {
    await removeVendorFile(stored.storageKey);
    throw error;
  }
}

export async function reviewProfileChange(
  reviewer: AuthenticatedUser,
  changeRequestId: string,
  action: "APPROVE" | "REJECT",
  note?: string,
) {
  const request = await prisma.vendorProfileChangeRequest.findUnique({
    where: { id: changeRequestId },
    include: {
      files: true,
      vendorProfile: {
        include: { files: true, user: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!request || request.status !== "PENDING") {
    throw new AppError(
      "PROFILE_CHANGE_NOT_REVIEWABLE",
      409,
      "This profile change request cannot be reviewed.",
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    if (action === "APPROVE") {
      const proposed = asStringRecord(request.proposed);
      const profileData: Prisma.VendorProfileUpdateInput = {};
      if (proposed.businessName) profileData.businessName = proposed.businessName;
      if (proposed.storeName) profileData.storeName = proposed.storeName;
      if (proposed.businessType) profileData.businessType = proposed.businessType;
      if (proposed.description) profileData.description = proposed.description;
      if (proposed.contactName) profileData.contactName = proposed.contactName;
      if (proposed.phone) profileData.phone = proposed.phone;
      if (proposed.country) profileData.country = proposed.country;
      if (proposed.region) profileData.region = proposed.region;
      if (proposed.city) profileData.city = proposed.city;
      if (proposed.district) profileData.district = proposed.district;
      if (proposed.address) profileData.address = proposed.address;
      if (proposed.marketAssociation) profileData.marketAssociation = proposed.marketAssociation;
      if (proposed.mobileMoneyNumber) profileData.mobileMoneyNumber = proposed.mobileMoneyNumber;
      if (Object.keys(profileData).length > 0) {
        await transaction.vendorProfile.update({
          where: { id: request.vendorProfileId },
          data: profileData,
        });
      }
      if (proposed.displayName) {
        await transaction.user.update({
          where: { id: request.vendorProfile.userId },
          data: { displayName: proposed.displayName },
        });
      }
      for (const file of request.files) {
        const previous = await transaction.vendorApplicationFile.findUnique({
          where: {
            vendorProfileId_fileType: {
              vendorProfileId: request.vendorProfileId,
              fileType: file.fileType,
            },
          },
          select: { storageKey: true },
        });
        await transaction.vendorApplicationFile.upsert({
          where: {
            vendorProfileId_fileType: {
              vendorProfileId: request.vendorProfileId,
              fileType: file.fileType,
            },
          },
          create: {
            vendorProfileId: request.vendorProfileId,
            fileType: file.fileType,
            storageKey: file.storageKey,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          },
          update: {
            storageKey: file.storageKey,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          },
        });
        if (previous && previous.storageKey !== file.storageKey) {
          await removeVendorFile(previous.storageKey);
        }
      }
    }

    const updated = await transaction.vendorProfileChangeRequest.update({
      where: { id: request.id },
      data: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedAt: new Date(),
        reviewedById: reviewer.id,
        adminNote: note ?? null,
      },
      select: changeRequestSelect,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: reviewer.id,
        action: `VENDOR_PROFILE_CHANGE_${action}`,
        entityType: "VendorProfileChangeRequest",
        entityId: request.id,
        metadata: { ...(note ? { note } : {}) },
      },
    });
    return updated;
  });

  const proposed = asStringRecord(request.proposed);
  await deliverVendorApplicationEmail(
    request.vendorProfileId,
    action === "APPROVE" ? "PROFILE_CHANGE_APPROVED" : "PROFILE_CHANGE_REJECTED",
    action === "APPROVE"
      ? summarizeProposed(proposed, request.files.map((file) => file.fileType))
      : note,
    true,
    true,
  );
  return { changeRequest: result };
}

export async function getProfileChangeFile(fileId: string, user: AuthenticatedUser) {
  const file = await prisma.vendorProfileChangeFile.findUnique({
    where: { id: fileId },
    include: {
      changeRequest: {
        select: { vendorProfile: { select: { userId: true } } },
      },
    },
  });
  if (
    !file ||
    (user.accountType === "VENDOR" && file.changeRequest.vendorProfile.userId !== user.id)
  ) {
    throw new AppError("FILE_NOT_FOUND", 404, "File not found.");
  }
  return file;
}

function currentSnapshot(profile: {
  businessName: string | null;
  storeName: string | null;
  businessType: string | null;
  description: string | null;
  contactName: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  marketAssociation: string | null;
  mobileMoneyNumber: string | null;
  user: { displayName: string | null };
}): Record<string, string> {
  return {
    displayName: profile.user.displayName ?? "",
    businessName: profile.businessName ?? "",
    storeName: profile.storeName ?? "",
    businessType: profile.businessType ?? "",
    description: profile.description ?? "",
    contactName: profile.contactName ?? "",
    phone: profile.phone ?? "",
    country: profile.country ?? "",
    region: profile.region ?? "",
    city: profile.city ?? "",
    district: profile.district ?? "",
    address: profile.address ?? "",
    marketAssociation: profile.marketAssociation ?? "",
    mobileMoneyNumber: profile.mobileMoneyNumber ?? "",
  };
}

function normalizeChangeFields(input: ProfileChangeInput): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of profileFieldKeys) {
    const value = input[key];
    if (typeof value === "string") next[key] = value.trim();
  }
  if (next.mobileMoneyNumber && !next.mobileMoneyNumber.startsWith("+") && next.country) {
    next.mobileMoneyNumber = normalizePhone(next.country, next.mobileMoneyNumber);
  }
  return next;
}

function buildProposed(
  snapshot: Record<string, string>,
  next: Record<string, string>,
): Record<string, string> {
  const proposed: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== snapshot[key]) proposed[key] = value;
  }
  return proposed;
}

function validateProposed(proposed: Record<string, string>): void {
  if (
    proposed.country &&
    proposed.region &&
    proposed.city &&
    !isKnownLocation(proposed.country, proposed.region, proposed.city, proposed.district)
  ) {
    throw new AppError("INVALID_LOCATION", 400, "Select a valid country, region, city, and district combination.");
  }
  if (proposed.phone && !isValidInternationalPhone(proposed.phone)) {
    throw new AppError("INVALID_PHONE", 400, "Enter a valid international phone number.");
  }
}

function asStringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) result[key] = entry;
  }
  return result;
}

function summarizeProposed(proposed: Record<string, string>, files: string[]): string {
  const labels: Record<string, string> = {
    displayName: "display name",
    storeName: "store name",
    businessName: "business name",
    businessType: "business type",
    description: "description",
    contactName: "contact name",
    phone: "phone number",
    country: "country",
    region: "region",
    city: "city",
    district: "district",
    address: "address",
    marketAssociation: "market association",
    mobileMoneyNumber: "payout number",
    STORE_LOGO: "store logo",
    BUSINESS_LICENSE: "business licence",
  };
  const parts = [
    ...Object.keys(proposed).map((key) => labels[key] ?? key),
    ...files.map((file) => labels[file] ?? file),
  ];
  if (parts.length === 0) return "Requested store profile updates.";
  return `Updated: ${parts.join(", ")}.`;
}
