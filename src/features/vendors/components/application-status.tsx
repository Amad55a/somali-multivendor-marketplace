"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";

const statusSchema = z.object({
  status: z.string(),
  verificationStatus: z.string(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  rejectionReason: z.string().optional(),
  informationRequest: z.string().optional(),
});

export function ApplicationStatus({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestApi(
      "/api/v1/vendor/onboarding/status",
      statusSchema,
      t("auth.requestFailed"),
    )
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-9">
      <h1 className="text-2xl font-bold text-[#123b35]">{t("auth.statusTitle")}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {t("auth.statusDescription")}
      </p>

      {status && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl bg-[#f5f8f6] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("auth.statusTitle")}
            </p>
            <p className="mt-1 text-lg font-bold text-[#123b35]">
              {statusLabel(status.status, t)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {t("auth.verificationStatus")}:{" "}
              {verificationLabel(status.verificationStatus, t)}
            </p>
          </div>

          {status.informationRequest && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="font-semibold text-[#123b35]">
                {t("auth.informationRequest")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {status.informationRequest}
              </p>
            </div>
          )}

          {status.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="font-semibold text-[#123b35]">
                {t("auth.rejectionReason")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {status.rejectionReason}
              </p>
            </div>
          )}

          {status.submittedAt && (
            <p className="text-sm text-slate-600">
              {t("auth.submitApplication")}:{" "}
              <time dateTime={status.submittedAt}>
                {new Date(status.submittedAt).toLocaleDateString(locale)}
              </time>
            </p>
          )}

          {(status.status === "DRAFT" ||
            status.status === "CHANGES_REQUESTED" ||
            status.status === "NOT_STARTED") && (
            <Link
              href={`/${locale}/vendor/onboarding`}
              className="inline-flex w-fit rounded-lg bg-[#123b35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d5149]"
            >
              {t("auth.editApplication")}
            </Link>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      {!status && !error && (
        <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
    </section>
  );
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const statuses = {
    NOT_STARTED: "auth.status.notStarted",
    DRAFT: "auth.status.draft",
    PENDING: "auth.status.pending",
    UNDER_REVIEW: "auth.status.underReview",
    CHANGES_REQUESTED: "auth.status.changesRequested",
    APPROVED: "auth.status.approved",
    REJECTED: "auth.status.rejected",
    SUSPENDED: "auth.status.suspended",
  } as const;
  return status in statuses
    ? t(statuses[status as keyof typeof statuses])
    : status;
}

function verificationLabel(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const statuses = {
    UNVERIFIED: "auth.status.unverified",
    PENDING: "auth.verificationPending",
    VERIFIED: "auth.verified",
    REJECTED: "auth.verificationRejected",
  } as const;
  return status in statuses
    ? t(statuses[status as keyof typeof statuses])
    : status;
}
