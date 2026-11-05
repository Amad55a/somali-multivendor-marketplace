import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client";
import { getDatabaseUrl } from "../src/config/env";
import { hashPassword } from "../src/features/auth/passwords";

const provisioningSchema = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  ADMIN_PASSWORD: z.string().min(12).max(128),
});

async function provisionAdmin() {
  const parsed = provisioningSchema.safeParse({
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error("Set a valid ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.");
  }

  const passwordHash = await hashPassword(parsed.data.ADMIN_PASSWORD);
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
  });

  try {
    await client.$transaction(async (transaction) => {
      const exists = await transaction.user.findUnique({
        where: {
          accountType_normalizedEmail: {
            accountType: "ADMIN",
            normalizedEmail: parsed.data.ADMIN_EMAIL,
          },
        },
        select: { id: true },
      });
      if (exists) throw new Error("An administrator with this email already exists.");

      const admin = await transaction.user.create({
        data: {
          email: parsed.data.ADMIN_EMAIL,
          normalizedEmail: parsed.data.ADMIN_EMAIL,
          accountType: "ADMIN",
          emailVerifiedAt: new Date(),
          authAccounts: {
            create: {
              provider: "LOCAL",
              passwordHash,
            },
          },
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          action: "ADMIN_PROVISIONED",
          entityType: "User",
          entityId: admin.id,
          metadata: { method: "private_cli" },
        },
      });
    });
  } finally {
    await client.$disconnect();
  }

  console.log("Administrator provisioned. MFA enrollment is required at first sign-in.");
}

provisionAdmin().catch((error: unknown) => {
  console.error(
    "Administrator provisioning failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
