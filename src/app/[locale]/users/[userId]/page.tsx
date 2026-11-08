export const instant = false;

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageSquareText,
  Package,
  ShieldCheck,
  Star,
  Store,
  User as UserIcon,
} from "lucide-react";
import { CustomerAwareSiteHeader } from "@/components/layout/customer-aware-site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { isLocale, type Locale } from "@/i18n/config";
import { getPublicUserProfile } from "@/features/customer/service";

export default async function PublicUserProfilePage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  if (
    !isLocale(locale) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    notFound();
  }

  let userProfile: Awaited<ReturnType<typeof getPublicUserProfile>> | null = null;
  try {
    userProfile = await getPublicUserProfile(userId);
  } catch {
    notFound();
  }

  if (!userProfile) notFound();

  const isSomali = locale === "so";
  const joinedDate = new Date(userProfile.joinedAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="site-chrome">
      <CustomerAwareSiteHeader />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href={`/${locale}/marketplace`}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8b5e08] hover:underline"
        >
          ← {isSomali ? "Ku noqo suuqa" : "Back to marketplace"}
        </Link>

        {/* User Profile Card */}
        <section className="relative overflow-hidden rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Profile Avatar / Photo */}
            <div className="relative">
              {userProfile.hasProfilePhoto ? (
                <Image
                  src={`/api/v1/users/${userProfile.id}/photo`}
                  alt={userProfile.displayName}
                  width={112}
                  height={112}
                  unoptimized
                  className="size-24 rounded-2xl border-2 border-[#e1e9e5] object-cover shadow-sm sm:size-28"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="grid size-24 shrink-0 place-items-center rounded-2xl bg-[#123b35] text-4xl font-extrabold text-[#f4b942] shadow-sm sm:size-28"
                >
                  {userProfile.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {/* Profile Details */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-extrabold text-[#123b35] sm:text-3xl">
                  {userProfile.displayName}
                </h1>

                {userProfile.accountType === "VENDOR" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    {isSomali ? "Iibiye La Hubiyey" : "Verified Vendor"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {isSomali ? "Macmiil" : "Customer"}
                  </span>
                )}
              </div>

              {/* Joined Date */}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="size-3.5 text-slate-400" />
                {isSomali ? `Wuxuu ku biiray: ${joinedDate}` : `Member since: ${joinedDate}`}
              </p>

              {/* Vendor Specific Info */}
              {userProfile.accountType === "VENDOR" && userProfile.vendor && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {userProfile.vendor.businessType && (
                    <p className="text-sm font-semibold text-[#a06c0b]">
                      {userProfile.vendor.businessType}
                    </p>
                  )}
                  {userProfile.vendor.location.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="size-3.5 text-slate-400" />
                      {userProfile.vendor.location.join(", ")}
                    </p>
                  )}
                  {userProfile.vendor.description && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-700">
                      {userProfile.vendor.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={`/${locale}/stores/${userProfile.id}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#123b35] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#194a43]"
                    >
                      <Store className="size-3.5" />
                      {isSomali ? "Booqo Dukaanka (Visit Store)" : "Visit Storefront"}
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Vendor Products Showcase */}
        {userProfile.accountType === "VENDOR" && userProfile.vendor?.products && userProfile.vendor.products.length > 0 && (
          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#123b35]">
                {isSomali ? "Alaabta Iibiyaha" : "Vendor Products"}
              </h2>
              <Link
                href={`/${locale}/stores/${userProfile.id}`}
                className="text-xs font-bold text-[#8b5e08] hover:underline"
              >
                {isSomali ? "Eeg dhammaan dukaanka →" : "View store catalog →"}
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {userProfile.vendor.products.map((prod) => (
                <Link
                  key={prod.id}
                  href={`/${locale}/marketplace/${prod.id}`}
                  className="group flex flex-col rounded-2xl border border-[#e1e9e5] bg-white p-3 shadow-sm transition hover:border-[#123b35]/30 hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#f8faf9]">
                    {prod.imageId ? (
                      <Image
                        src={`/api/v1/products/images/${prod.imageId}`}
                        alt={prod.name}
                        width={300}
                        height={300}
                        unoptimized
                        className="size-full object-contain p-2 transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-xs text-slate-400">
                        No image
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2.5 line-clamp-1 text-sm font-semibold text-[#123b35] group-hover:text-[#a06c0b]">
                    {isSomali ? prod.nameSo ?? prod.name : prod.name}
                  </h3>
                  <p className="mt-1 text-sm font-bold text-[#123b35]">${prod.price}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Customer Public Reviews */}
        {userProfile.accountType === "CUSTOMER" && userProfile.customer && (
          <section className="mt-10 rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#123b35]">
              {isSomali ? "Qiimayno La Daabacay" : "Published Customer Reviews"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSomali
                ? "Fikradaha iyo qiimaynta macmiilkani ka dhiibtay alaabaha suuqa"
                : "Product reviews and ratings submitted by this customer"}
            </p>

            {userProfile.customer.reviews.length > 0 ? (
              <div className="mt-6 space-y-4">
                {userProfile.customer.reviews.map((rev) => (
                  <article
                    key={rev.id}
                    className="rounded-2xl border border-slate-100 bg-[#f8faf9] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-600 text-sm">
                          {"★".repeat(rev.rating)}{"☆".repeat(5 - rev.rating)}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <time dateTime={rev.createdAt} className="text-xs text-slate-400">
                          {new Date(rev.createdAt).toLocaleDateString(locale)}
                        </time>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-800">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        {isSomali ? "Iibsi La Hubiyey" : "Verified Purchase"}
                      </span>
                    </div>

                    {rev.comment && (
                      <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
                        {rev.comment}
                      </p>
                    )}

                    <div className="mt-3 border-t border-slate-200/60 pt-2.5">
                      <Link
                        href={`/${locale}/marketplace/${rev.product.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#8b5e08] hover:underline"
                      >
                        <Package className="size-3.5" />
                        {isSomali ? "Alaabta" : "Product"}: {isSomali ? rev.product.nameSo ?? rev.product.name : rev.product.name}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                <p className="text-sm">
                  {isSomali ? "Macmiilkani weli wax qiimayn ah ma qorin." : "No reviews submitted yet."}
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
