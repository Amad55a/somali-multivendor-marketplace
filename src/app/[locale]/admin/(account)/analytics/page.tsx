export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { AdminMarketplaceAnalytics } from "@/features/admin/components/admin-marketplace-analytics";

export default async function AdminAnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminMarketplaceAnalytics />;
}
