import type {
  AccountType,
  VendorApplicationStatus,
} from "../../../generated/prisma/client";
import type { AuthenticatedUser } from "@/features/auth/sessions";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";

export async function getAdminOverview() {
  const [
    totalUsers,
    totalCustomers,
    totalVendors,
    pendingApplications,
    approvedVendors,
    rejectedApplications,
    draftApplications,
    changesRequestedApplications,
    recentActivity,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { accountType: "CUSTOMER" } }),
    prisma.user.count({ where: { accountType: "VENDOR" } }),
    prisma.vendorProfile.count({
      where: { applicationStatus: { in: ["PENDING", "UNDER_REVIEW"] } },
    }),
    prisma.vendorProfile.count({ where: { applicationStatus: "APPROVED" } }),
    prisma.vendorProfile.count({ where: { applicationStatus: "REJECTED" } }),
    prisma.vendorProfile.count({ where: { applicationStatus: "DRAFT" } }),
    prisma.vendorProfile.count({
      where: { applicationStatus: "CHANGES_REQUESTED" },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
  ]);

  return {
    totalUsers,
    totalCustomers,
    totalVendors,
    pendingApplications,
    approvedVendors,
    rejectedApplications,
    statusBreakdown: {
      draft: draftApplications,
      pending: pendingApplications,
      approved: approvedVendors,
      rejected: rejectedApplications,
      changesRequested: changesRequestedApplications,
    },
    recentActivity: recentActivity.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      actorEmail: entry.actor?.email ?? null,
    })),
  };
}

export async function getAdminProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, accountType: "ADMIN" },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      isActive: true,
      createdAt: true,
      adminMfaMethod: { select: { enabled: true, verifiedAt: true } },
    },
  });
  if (!user) return null;
  return {
    ...user,
    mfaEnabled: user.adminMfaMethod?.enabled ?? false,
    mfaVerifiedAt: user.adminMfaMethod?.verifiedAt ?? null,
    adminMfaMethod: undefined,
  };
}

export async function listAdminUsers(
  accountType: AccountType | undefined,
  vendorStatus: VendorApplicationStatus | undefined,
  active: "ACTIVE" | "INACTIVE" | undefined,
  search: string | undefined,
  cursor: string | undefined,
  limit: number,
) {
  const normalizedSearch = search?.trim();
  const users = await prisma.user.findMany({
    where: {
      ...(accountType ? { accountType } : {}),
      ...(active ? { isActive: active === "ACTIVE" } : {}),
      ...(vendorStatus
        ? { vendorProfile: { is: { applicationStatus: vendorStatus } } }
        : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { email: { contains: normalizedSearch, mode: "insensitive" } },
              {
                vendorProfile: {
                  is: {
                    contactName: {
                      contains: normalizedSearch,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      email: true,
      displayName: true,
      accountType: true,
      emailVerifiedAt: true,
      isActive: true,
      createdAt: true,
      vendorProfile: {
        select: {
          contactName: true,
          applicationStatus: true,
        },
      },
    },
  });

  return {
    users: users.map((user) => ({
      id: user.id,
      name:
        user.displayName ??
        user.vendorProfile?.contactName ??
        readableEmailName(user.email),
      email: user.email,
      accountType: user.accountType,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
      vendorApplicationStatus: user.vendorProfile?.applicationStatus ?? null,
      isActive: user.isActive,
    })),
    nextCursor: users.length === limit ? users.at(-1)?.id ?? null : null,
  };
}

export async function suspendAdminUser(
  actor: AuthenticatedUser,
  userId: string,
) {
  if (actor.id === userId) {
    throw new AppError("SELF_ACTION_FORBIDDEN", 409, "You cannot suspend your own account.");
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, accountType: true, isActive: true },
  });
  if (!target) throw new AppError("USER_NOT_FOUND", 404, "User not found.");
  if (!target.isActive) return { userId: target.id, active: false };

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: target.id },
      data: { isActive: false },
    });
    await transaction.userSession.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "USER_SUSPENDED",
        entityType: "User",
        entityId: target.id,
        metadata: { email: target.email, accountType: target.accountType },
      },
    });
  });
  return { userId: target.id, active: false };
}

export async function deleteAdminUser(
  actor: AuthenticatedUser,
  userId: string,
) {
  if (actor.id === userId) {
    throw new AppError("SELF_ACTION_FORBIDDEN", 409, "You cannot delete your own account.");
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, accountType: true },
  });
  if (!target) throw new AppError("USER_NOT_FOUND", 404, "User not found.");

  await prisma.$transaction(async (transaction) => {
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "USER_DELETED",
        entityType: "User",
        entityId: target.id,
        metadata: { email: target.email, accountType: target.accountType },
      },
    });
    await transaction.user.delete({ where: { id: target.id } });
  });
  return { userId: target.id, deleted: true };
}

function readableEmailName(email: string): string {
  const localPart = email.split("@", 1)[0] ?? email;
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function listAdminAuditLogs(
  cursor: string | undefined,
  limit: number,
) {
  const logs = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  });

  return {
    auditLogs: logs.map((log) => ({
      ...log,
      actorEmail: log.actor?.email ?? null,
    })),
    nextCursor: logs.length === limit ? logs.at(-1)?.id ?? null : null,
  };
}
