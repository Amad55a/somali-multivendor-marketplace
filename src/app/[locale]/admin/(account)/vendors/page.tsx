export const instant = false;

import { notFound } from "next/navigation";
import { UsersDirectory } from "@/features/admin/components/users-directory";
import { isLocale } from "@/i18n/config";

export default async function AdminVendorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <UsersDirectory
      locale={locale}
      initialAccountType="VENDOR"
      initialVendorStatus="APPROVED"
    />
  );
}
