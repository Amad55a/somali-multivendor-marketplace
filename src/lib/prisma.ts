import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { getDatabaseUrl } from "@/config/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma &&
  typeof globalForPrisma.prisma.simulatedPaymentAttempt?.findFirst === "function" &&
  typeof globalForPrisma.prisma.commissionSettings?.findUnique === "function" &&
  typeof globalForPrisma.prisma.payoutBatch?.findMany === "function" &&
  typeof globalForPrisma.prisma.payoutAllocation?.findMany === "function"
    ? globalForPrisma.prisma
    : new PrismaClient({
        adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
      });

const stalePrisma = globalForPrisma.prisma && globalForPrisma.prisma !== prisma
  ? globalForPrisma.prisma
  : null;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  if (stalePrisma) {
    void stalePrisma.$disconnect().catch((error: unknown) => {
      console.error("[prisma] Could not disconnect the outdated development client", error);
    });
  }
}
