import { notFound } from "next/navigation";
import { AdminFinancialReconciliation } from "@/features/admin/components/admin-financial-reconciliation";
import { isLocale } from "@/i18n/config";

export default async function AdminFinancialReconciliationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminFinancialReconciliation />;
}
