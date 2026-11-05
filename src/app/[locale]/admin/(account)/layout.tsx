import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { requirePageAccount } from "@/lib/auth/route-guards";

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
  await requirePageAccount("ADMIN", locale);
  const dictionary = await getDictionary(locale);

  return (
    <div className="site-chrome">
      <SiteHeader />
      <main className="mx-auto min-h-[65vh] max-w-7xl px-4 py-8 sm:px-8 lg:px-10">
        <nav className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ece9] pb-4">
          <Link
            href={`/${locale}/admin/vendors/applications`}
            className="text-sm font-semibold text-[#123b35]"
          >
            {dictionary.auth.reviewApplications}
          </Link>
          <LogoutButton locale={locale} admin />
        </nav>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
