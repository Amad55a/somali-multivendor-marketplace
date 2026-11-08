import { notFound } from "next/navigation";
import { AdminProfile } from "@/features/admin/components/admin-profile";
import { getAdminProfile } from "@/features/admin/service";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("ADMIN", locale);
  const profile = await getAdminProfile(user.id);
  if (!profile) notFound();
  return <AdminProfile locale={locale} profile={profile} />;
}
