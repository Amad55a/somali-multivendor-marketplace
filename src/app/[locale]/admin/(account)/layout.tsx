import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { SupportRouteFallback } from "@/features/support/components/support-route-fallback";

export default async function AdminAccountLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense fallback={<SupportRouteFallback locale={locale} />}>
      <AuthenticatedAdminAccountLayout locale={locale}>
        {children}
      </AuthenticatedAdminAccountLayout>
    </Suspense>
  );
}

async function AuthenticatedAdminAccountLayout({
  children,
  locale,
}: Readonly<{ children: ReactNode; locale: Locale }>) {
  const user = await requirePageAccount("ADMIN", locale);
  return (
    <AdminShell locale={locale} email={user.email}>
      {children}
    </AdminShell>
  );
}
