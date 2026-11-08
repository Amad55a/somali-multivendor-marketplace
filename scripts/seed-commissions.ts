import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const rates: Record<string, number> = {
  electronics: 8,
  "clothing-fashion": 12,
};

async function main() {
  const [categories, settings, admin] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        commission: { select: { id: true, percent: true, isActive: true, updatedById: true } },
      },
    }),
    prisma.commissionSettings.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.user.findFirst({
      where: { accountType: "ADMIN", isActive: true },
      select: { id: true },
    }),
  ]);
  const legacyChildDefaults = categories.filter((category) =>
    category.parentId !== null
    && category.commission?.isActive
    && category.commission.updatedById === null
    && category.commission.percent.eq(settings.defaultPercent),
  );
  if (legacyChildDefaults.length > 0 && !admin) {
    throw new Error("An active admin is required to audit legacy child commission rule cleanup.");
  }

  await prisma.$transaction(async (tx) => {
    for (const category of categories) {
      const percent = rates[category.slug];
      if (percent === undefined) continue;
      await tx.categoryCommission.upsert({
        where: { categoryId: category.id },
        update: {},
        create: { categoryId: category.id, percent },
      });
    }

    for (const category of legacyChildDefaults) {
      if (!admin || !category.commission) throw new Error("The legacy commission cleanup requires an active admin.");
      const updated = await tx.categoryCommission.updateMany({
        where: {
          categoryId: category.id,
          isActive: true,
          updatedById: null,
          percent: settings.defaultPercent,
        },
        data: { isActive: false, updatedById: admin.id },
      });
      if (updated.count !== 1) throw new Error(`Commission rule changed during cleanup: ${category.name}`);
      await tx.categoryCommissionHistory.create({
        data: {
          categoryId: category.id,
          categoryName: category.name,
          previousPercent: category.commission.percent,
          percent: category.commission.percent,
          isActive: false,
          changedById: admin.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "SEEDED_CHILD_COMMISSION_DEFAULT_DEACTIVATED",
          entityType: "CategoryCommission",
          entityId: category.id,
          metadata: {
            categoryName: category.name,
            percent: category.commission.percent.toString(),
            reason: "A seeded default rate on a child category prevented inheritance from its nearest active ancestor.",
          },
        },
      });
    }

    if (legacyChildDefaults.length > 0) {
      const products = await tx.product.findMany({
        where: { categoryId: { in: legacyChildDefaults.map((category) => category.id) } },
        select: { vendorId: true },
        distinct: ["vendorId"],
      });
      if (products.length > 0) {
        await tx.vendorNotification.createMany({
          data: products.map(({ vendorId }) => ({
            vendorId,
            title: "Category commission inheritance corrected",
            titleSo: "Dhaxalka komishanka qaybta waa la saxay",
            body: "Seeded child-category defaults were deactivated so future orders inherit the nearest active parent commission rate.",
            bodySo: "Heerarkii caadiga ahaa ee qaybaha hoose waa la damiyey si dalabyada mustaqbalka ay u dhaxlaan heerka waalidka ugu dhow ee firfircoon.",
            entityType: "CategoryCommission",
            entityId: legacyChildDefaults[0]!.id,
            href: "/vendor/payouts",
          })),
        });
      }
    }
  });
  console.log(`Seeded ${Object.keys(rates).length} explicit category rates; deactivated ${legacyChildDefaults.length} audited child defaults.`);
}

main().finally(() => prisma.$disconnect());
