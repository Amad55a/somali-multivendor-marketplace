import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";

export const instant = false;

export default async function VendorOnboardingLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requirePageAccount("VENDOR", locale);

  return (
    <main className="min-h-screen bg-[#f5f8f6] px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">{children}</div>
    </main>
  );
}
