import "server-only";

import { prisma } from "@/lib/prisma";

export async function createAdminNotification(input: {
  type: string;
  title: string;
  titleSo: string;
  body: string;
  bodySo: string;
  href?: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.adminNotification.create({
    data: {
      type: input.type,
      title: input.title,
      titleSo: input.titleSo,
      body: input.body,
      bodySo: input.bodySo,
      href: input.href,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });
}

export async function listAdminNotifications() {
  const [notifications, unreadCount] = await Promise.all([
    prisma.adminNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.adminNotification.count({ where: { readAt: null } }),
  ]);
  return {
    notifications,
    unreadCount,
  };
}

export async function markAdminNotificationsRead(id?: string) {
  await prisma.adminNotification.updateMany({
    where: { readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return listAdminNotifications();
}
