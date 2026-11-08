import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";
import type { Locale } from "@/i18n/config";
import { SupportRouteFallback } from "@/features/support/components/support-route-fallback";

export default async function CustomerHelpLayout({
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
      <AuthenticatedCustomerHelpLayout locale={locale}>
        {children}
      </AuthenticatedCustomerHelpLayout>
    </Suspense>
  );
}

async function AuthenticatedCustomerHelpLayout({
  children,
  locale,
}: Readonly<{ children: ReactNode; locale: Locale }>) {
  const customer = await requirePageAccount("CUSTOMER", locale);
  return (
    <div className="site-chrome">
      <SiteHeader
        authenticated
        customerName={customer.displayName ?? null}
        customerEmail={customer.email}
        customerHasPhoto={customer.hasProfilePhoto}
      />
      {children}
      <SiteFooter />
    </div>
  );
}
