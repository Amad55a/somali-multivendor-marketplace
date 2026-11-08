import { notFound } from "next/navigation";
import { AdminReviewModeration } from "@/features/admin/components/admin-review-moderation";
import { isLocale } from "@/i18n/config";

export default async function AdminReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminReviewModeration locale={locale} />;
}
