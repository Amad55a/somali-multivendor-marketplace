import { notFound } from "next/navigation";
import { AdminAuditLogs } from "@/features/admin/components/admin-audit-logs";
import { isLocale } from "@/i18n/config";

export default async function AdminAuditLogsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminAuditLogs locale={locale} />;
}
