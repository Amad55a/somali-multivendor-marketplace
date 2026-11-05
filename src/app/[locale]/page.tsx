import { Suspense } from "react";
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
      <Suspense
        fallback={
          <main
            aria-busy="true"
            className="mx-auto min-h-48 max-w-7xl px-4 py-12 text-center text-sm text-slate-600 sm:px-8 lg:px-10"
          >
            {dictionary.header.searchLoading}
          </main>
        }
      >
        <SearchableHomePage dictionary={dictionary} searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </div>
  );
}

async function SearchableHomePage({
  dictionary,
  searchParams,
}: {
  dictionary: Awaited<ReturnType<typeof getDictionary>>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  return (
    <HomePage
      dictionary={dictionary}
      searchQuery={typeof q === "string" ? q : ""}
    />
  );
}
