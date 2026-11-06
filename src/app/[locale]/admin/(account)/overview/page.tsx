import { notFound } from "next/navigation";
import { AdminOverview } from "@/features/admin/components/admin-overview";
import { isLocale } from "@/i18n/config";

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminOverview locale={locale} />;
}
