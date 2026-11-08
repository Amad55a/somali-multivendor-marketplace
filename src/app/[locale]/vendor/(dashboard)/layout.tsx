import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { VendorShell } from "@/features/vendors/components/vendor-shell";
import { getVendorShellContext } from "@/features/vendors/dashboard-service";
import { SupportLauncher } from "@/features/support/components/support-portal";
import { SupportRouteFallback } from "@/features/support/components/support-route-fallback";

export default async function VendorDashboardLayout({ children, params }: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense fallback={<SupportRouteFallback locale={locale} />}>
      <AuthenticatedVendorDashboardLayout locale={locale}>
        {children}
      </AuthenticatedVendorDashboardLayout>
    </Suspense>
  );
}

async function AuthenticatedVendorDashboardLayout({
  children,
  locale,
}: Readonly<{ children: ReactNode; locale: Locale }>) {
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
      <SupportLauncher audience="vendor" />
    </VendorShell>
  );
}
