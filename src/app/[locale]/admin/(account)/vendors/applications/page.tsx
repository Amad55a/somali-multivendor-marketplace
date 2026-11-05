import { notFound } from "next/navigation";
import { ReviewBoard } from "@/features/vendors/components/review-board";
import { isLocale } from "@/i18n/config";

export default async function AdminVendorApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ReviewBoard />;
}
