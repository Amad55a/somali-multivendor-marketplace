import { notFound } from "next/navigation";
import { VendorFinancialStatement } from "@/features/commerce/components/vendor-financial-statement";
import { isLocale } from "@/i18n/config";

export default async function VendorPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <VendorFinancialStatement />;
}
