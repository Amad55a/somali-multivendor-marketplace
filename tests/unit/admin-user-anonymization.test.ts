import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  userAuthAccount: { deleteMany: vi.fn() },
  userSession: { deleteMany: vi.fn() },
  emailVerificationCode: { deleteMany: vi.fn() },
  loginAttempt: { deleteMany: vi.fn() },
  shoppingCart: { deleteMany: vi.fn() },
  adminMfaMethod: { deleteMany: vi.fn() },
  adminRecoveryCode: { deleteMany: vi.fn() },
  adminLoginChallenge: { deleteMany: vi.fn() },
  auditLog: { updateMany: vi.fn(), create: vi.fn() },
  vendorProfile: { update: vi.fn() },
  vendorApplicationEmail: { deleteMany: vi.fn() },
  vendorApplicationFile: { deleteMany: vi.fn() },
  vendorProfileChangeRequest: { deleteMany: vi.fn() },
  productImage: { deleteMany: vi.fn() },
  product: { update: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/media/vendor-files", () => ({ removeVendorFile: vi.fn() }));

import type { AuthenticatedUser } from "@/features/auth/sessions";
import { anonymizeAdminUser } from "@/features/admin/service";
import { removeVendorFile } from "@/lib/media/vendor-files";
import { prisma } from "@/lib/prisma";

const actor: AuthenticatedUser = {
  id: "admin-id",
  email: "admin@example.test",
  accountType: "ADMIN",
  emailVerifiedAt: new Date(),
  hasAmazonIdentity: false,
  sessionId: "admin-session",
};

const target = {
  id: "vendor-id",
  accountType: "VENDOR" as const,
  profileImageKey: "profile.png",
  vendorProfile: {
    id: "vendor-profile-id",
    files: [{ storageKey: "license.pdf" }],
    changeRequests: [{ files: [{ storageKey: "change-license.pdf" }] }],
  },
  productImages: [{ storageKey: "product.png" }],
  products: [{ id: "product-id" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(target as never);
  database.$transaction.mockImplementation(
    async (operation) => operation(database),
  );
});

describe("admin user anonymization", () => {
  it("removes account identity and vendor listings while retaining history", async () => {
    await expect(anonymizeAdminUser(actor, target.id)).resolves.toEqual({
      userId: target.id,
      anonymized: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: {
        email: `deleted+${target.id}@deleted.invalid`,
        normalizedEmail: `deleted+${target.id}@deleted.invalid`,
        displayName: null,
        profileImageKey: null,
        emailVerifiedAt: null,
        isActive: false,
      },
    });
    expect(database.userAuthAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: target.id },
    });
    expect(database.userSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: target.id },
    });
    expect(database.vendorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: target.vendorProfile.id },
        data: expect.objectContaining({
          applicationStatus: "SUSPENDED",
          contactName: null,
          mobileMoneyNumber: null,
        }),
      }),
    );
    expect(database.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-id" },
        data: expect.objectContaining({
          name: "Removed listing",
          slug: "removed-product-id",
          status: "ARCHIVED",
        }),
      }),
    );
    expect(database.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "USER_ANONYMIZED",
          metadata: {
            accountType: "VENDOR",
            marketplaceHistoryRetained: true,
          },
        }),
      }),
    );
    expect(database.user.delete).not.toHaveBeenCalled();
    expect(removeVendorFile).toHaveBeenCalledTimes(4);
    expect(removeVendorFile).toHaveBeenCalledWith("license.pdf");
    expect(removeVendorFile).toHaveBeenCalledWith("change-license.pdf");
    expect(removeVendorFile).toHaveBeenCalledWith("product.png");
    expect(removeVendorFile).toHaveBeenCalledWith("profile.png");
  });

  it("prevents an administrator from anonymizing their own account", async () => {
    await expect(anonymizeAdminUser(actor, actor.id)).rejects.toMatchObject({
      code: "SELF_ACTION_FORBIDDEN",
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
