import { notFound } from "next/navigation";
import { AdminCommissionManager } from "@/features/admin/components/admin-commission-manager";
import { isLocale } from "@/i18n/config";

export default async function AdminCommissionSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminCommissionManager />;
}
