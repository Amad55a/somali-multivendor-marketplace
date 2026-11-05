import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { isLocale } from "@/i18n/config";

export const instant = false;

export default async function VerifyEmailPage({
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
      mode="verify-email"
      initialAccountType={query.accountType === "VENDOR" ? "VENDOR" : "CUSTOMER"}
    />
  );
}
