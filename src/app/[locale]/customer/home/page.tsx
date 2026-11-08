import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isLocale } from "@/i18n/config";

export const instant = false;

export default async function CustomerHomeAlias({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  redirect(`/${locale}/customer/dashboard`);
}
