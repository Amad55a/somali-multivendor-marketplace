import { notFound } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { isLocale } from "@/i18n/config";
import { redirectAuthenticatedPage } from "@/lib/auth/route-guards";

export const instant = false;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountType?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  await redirectAuthenticatedPage(locale);

  return (
    <AuthForm
      locale={locale}
      mode="login"
      initialAccountType={query.accountType === "VENDOR" ? "VENDOR" : "CUSTOMER"}
    />
  );
}
