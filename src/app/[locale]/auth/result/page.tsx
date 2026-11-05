import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary, createTranslator } from "@/i18n/get-dictionary";

export const instant = false;

export default async function AmazonAuthResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; accountType?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);
  const t = createTranslator(dictionary);
  const accountType = query.accountType === "VENDOR" ? "VENDOR" : "CUSTOMER";
  const resultMessages: Record<string, string> = {
    amazon_cancelled: t("auth.amazonCancelled"),
    amazon_failed: t("auth.amazonFailed"),
    amazon_unavailable: t("auth.amazonUnavailable"),
    account_link_required: t("auth.accountLinkRequired"),
    verify_email: t("auth.amazonVerifyEmail"),
  };
  const message = resultMessages[query.status ?? ""] ?? t("auth.amazonFailed");

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-7xl items-start justify-center px-4 py-12 sm:px-8 sm:py-16">
      <section className="w-full max-w-lg rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-9">
        <h1 className="text-2xl font-bold text-[#123b35]">{t("auth.loginTitle")}</h1>
        <p role="status" className="mt-4 text-sm leading-6 text-slate-700">
          {message}
        </p>
        {query.status === "verify_email" ? (
          <Link
            href={`/${locale}/verify-email?accountType=${accountType}`}
            className="mt-6 inline-flex rounded-lg bg-[#123b35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d5149]"
          >
            {t("auth.verifyEmailTitle")}
          </Link>
        ) : (
          <Link
            href={`/${locale}/login?accountType=${accountType}`}
            className="mt-6 inline-flex rounded-lg bg-[#123b35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d5149]"
          >
            {t("auth.backToLogin")}
          </Link>
        )}
      </section>
    </main>
  );
}
