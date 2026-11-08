export const instant = false;

import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { AdminCategoryManager } from "@/features/admin/components/admin-category-manager";

export default async function AdminCategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminCategoryManager />;
}
