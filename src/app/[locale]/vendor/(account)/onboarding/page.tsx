import { notFound } from "next/navigation";
import { OnboardingForm } from "@/features/vendors/components/onboarding-form";
import { isLocale } from "@/i18n/config";

export default async function VendorOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OnboardingForm locale={locale} />;
}
