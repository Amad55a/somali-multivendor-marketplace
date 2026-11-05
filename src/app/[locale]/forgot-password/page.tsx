import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { isLocale } from "@/i18n/config";

export const instant = false;

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountType?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return (
    <AuthForm
      locale={locale}
      mode="forgot-password"
      initialAccountType={query.accountType === "VENDOR" ? "VENDOR" : "CUSTOMER"}
    />
  );
}
