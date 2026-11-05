import { notFound } from "next/navigation";
import { HomePage } from "@/features/homepage/components/home-page";
import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale } from "@/i18n/config";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function LocalizedHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const dictionary = await getDictionary(localeParam);

  return (
    <div className="site-chrome">
      <SiteHeader />
      <HomePage dictionary={dictionary} searchParams={searchParams} />
      <SiteFooter />
    </div>
  );
}
