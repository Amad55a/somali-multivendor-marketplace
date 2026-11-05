import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { requirePageAccount } from "@/lib/auth/route-guards";

export const instant = false;

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  const dictionary = await getDictionary(locale);

  return (
    <div className="site-chrome">
      <SiteHeader />
      <main className="mx-auto min-h-[65vh] max-w-4xl px-4 py-12 sm:px-8">
        <section className="rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-9">
          <h1 className="text-2xl font-bold text-[#123b35]">
            {dictionary.auth.accountTitle}
          </h1>
          <p className="mt-4 text-sm text-slate-600">
            {dictionary.auth.signedInAs}:{" "}
            <span className="font-semibold text-[#123b35]">{user.email}</span>
          </p>
          <div className="mt-6">
            <LogoutButton locale={locale} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
