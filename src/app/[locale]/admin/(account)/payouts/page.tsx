import { notFound } from "next/navigation";
import { AdminPayoutManager } from "@/features/admin/components/admin-payout-manager";
import { isLocale } from "@/i18n/config";

export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminPayoutManager />;
}
