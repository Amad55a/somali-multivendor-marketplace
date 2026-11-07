import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { AdminNotifications } from "@/features/admin/components/admin-notifications";

export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminNotifications />;
}
