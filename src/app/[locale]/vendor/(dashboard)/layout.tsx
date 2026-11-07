import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorShell } from "@/features/vendors/components/vendor-shell";
import { getVendorShellContext } from "@/features/vendors/dashboard-service";

export const instant = false;

export default async function VendorDashboardLayout({ children, params }: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const vendor = await getVendorShellContext(user.id);
  return (
    <VendorShell
      locale={locale}
      email={user.email}
      storeName={vendor.storeName}
      logoFileId={vendor.logoFileId}
    >
      {children}
    </VendorShell>
  );
}
