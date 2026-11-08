import { notFound } from "next/navigation";
import { AdminReturnsDisputes } from "@/features/admin/components/admin-returns-disputes";
import { isLocale } from "@/i18n/config";

export default async function AdminReturnsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminReturnsDisputes locale={locale} />;
}
