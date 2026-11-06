import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/features/vendors/components/application-detail";
import { isLocale } from "@/i18n/config";

export default async function AdminVendorApplicationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; applicationId: string }>;
}) {
  const { locale, applicationId } = await params;
  if (!isLocale(locale)) notFound();
  return <ApplicationDetail applicationId={applicationId} locale={locale} />;
}
