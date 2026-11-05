import { notFound } from "next/navigation";
import { ApplicationStatus } from "@/features/vendors/components/application-status";
import { isLocale } from "@/i18n/config";

export default async function VendorApplicationStatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ApplicationStatus locale={locale} />;
}
