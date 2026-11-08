import { notFound } from "next/navigation";
import { SmsOutbox } from "@/features/admin/components/sms-outbox";
import { isLocale } from "@/i18n/config";

export default async function AdminSmsOutboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SmsOutbox locale={locale} />;
}
