import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Geist } from "next/font/google";
import { LocaleProvider } from "@/i18n/locale-provider";
import { LiveRouteRefresh } from "@/components/layout/live-route-refresh";
import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale, locales } from "@/i18n/config";
import "../globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const instant = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const dictionary = await getDictionary(localeParam);
  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    icons: { icon: "/images/brand/somsuuq-mark.svg" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const dictionary = await getDictionary(localeParam);

  return (
    <html
      lang={localeParam}
      dir="ltr"
      className={`${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={localeParam} dictionary={dictionary}>
          <LiveRouteRefresh />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
