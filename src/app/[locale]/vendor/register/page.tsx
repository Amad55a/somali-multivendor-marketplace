import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { isLocale } from "@/i18n/config";
import { redirectAuthenticatedPage } from "@/lib/auth/route-guards";

export const instant = false;

export default async function VendorRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await redirectAuthenticatedPage(locale);
  return (
    <AuthForm locale={locale} mode="register" initialAccountType="VENDOR" />
  );
}
