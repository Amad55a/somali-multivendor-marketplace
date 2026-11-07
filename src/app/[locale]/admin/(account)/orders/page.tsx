import { notFound } from "next/navigation";
import { AdminUnavailable } from "@/features/admin/components/admin-unavailable";
import { isLocale } from "@/i18n/config";

export default async function AdminOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminUnavailable locale={locale} />;
}
