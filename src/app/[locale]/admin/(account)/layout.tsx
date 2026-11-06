import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { AdminShell } from "@/features/admin/components/admin-shell";

export const instant = false;

export default async function AdminAccountLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("ADMIN", locale);

  return (
    <AdminShell locale={locale} email={user.email}>{children}</AdminShell>
  );
}
