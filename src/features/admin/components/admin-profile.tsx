"use client";

import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";

export function AdminProfile({
  locale,
  profile,
}: Readonly<{
  locale: Locale;
  profile: {
    email: string;
    emailVerifiedAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    mfaEnabled: boolean;
  };
}>) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-2xl font-bold text-[#123b35]">{t("admin.settings.title")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("admin.settings.description")}</p>
      <dl className="mt-6 grid gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.settings.email")}</dt>
          <dd className="mt-1 break-all text-sm font-medium text-[#123b35]">{profile.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.settings.status")}</dt>
          <dd className="mt-1 text-sm font-medium text-[#123b35]">{profile.isActive ? t("admin.settings.active") : t("admin.settings.inactive")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.settings.emailVerification")}</dt>
          <dd className="mt-1 text-sm font-medium text-[#123b35]">{profile.emailVerifiedAt ? new Date(profile.emailVerifiedAt).toLocaleDateString(locale) : t("admin.settings.notVerified")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.settings.mfa")}</dt>
          <dd className="mt-1 text-sm font-medium text-[#123b35]">{profile.mfaEnabled ? t("admin.settings.enabled") : t("admin.settings.notEnabled")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.settings.created")}</dt>
          <dd className="mt-1 text-sm font-medium text-[#123b35]">{new Date(profile.createdAt).toLocaleDateString(locale)}</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-xl border border-[#f4b942]/50 bg-[#fff9e8] p-4 text-sm text-[#6b4c07]">
        {t("admin.settings.limitation")}
      </p>
    </section>
  );
}
