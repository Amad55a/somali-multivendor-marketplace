"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";

const applicationSchema = z.object({
  id: z.string(),
  applicationStatus: z.enum([
    "DRAFT",
    "PENDING",
    "UNDER_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "REJECTED",
    "SUSPENDED",
  ]),
  verificationStatus: z.string(),
  businessName: z.string().nullable(),
  storeName: z.string().nullable(),
  businessType: z.string().nullable(),
  description: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  marketAssociation: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  informationRequest: z.string().nullable(),
  mobileMoneyNumber: z.string().nullable(),
  files: z.array(z.object({
    id: z.string(),
    fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
    mimeType: z.string(),
    originalName: z.string(),
    sizeBytes: z.number(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    emailVerifiedAt: z.string().nullable(),
    displayName: z.string().nullable().optional(),
    hasAmazonIdentity: z.boolean(),
  }),
  pendingChangeRequest: z.object({
    id: z.string(),
    status: z.string(),
    proposed: z.record(z.string(), z.unknown()),
    currentSnapshot: z.record(z.string(), z.unknown()).optional(),
    vendorNote: z.string().nullable().optional(),
    submittedAt: z.string().nullable().optional(),
    files: z.array(z.object({
      id: z.string(),
      fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
      mimeType: z.string(),
      originalName: z.string(),
      sizeBytes: z.number().optional(),
    })),
  }).nullable().optional(),
  emailDeliveries: z.array(z.object({
    id: z.string(),
    event: z.enum([
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "CHANGES_REQUESTED",
      "PROFILE_CHANGE_SUBMITTED",
      "PROFILE_CHANGE_APPROVED",
      "PROFILE_CHANGE_REJECTED",
    ]),
    recipientEmail: z.string(),
    attemptCount: z.number(),
    sentAt: z.string().nullable(),
    lastAttemptAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })).optional(),
});
const applicationResponseSchema = z.object({ application: applicationSchema });
type Application = z.infer<typeof applicationSchema>;
type ReviewAction = "approve" | "reject" | "request-information";

const fieldLabels = {
  businessName: "auth.businessName",
  storeName: "auth.storeName",
  businessType: "auth.businessType",
  description: "auth.businessDescription",
  contactName: "auth.contactName",
  phone: "auth.phone",
  country: "auth.country",
  region: "auth.region",
  city: "auth.city",
  address: "auth.address",
  marketAssociation: "auth.marketAssociation",
  mobileMoneyNumber: "auth.mobileMoneyNumber",
} as const;

export function ApplicationDetail({
  applicationId,
  locale,
}: Readonly<{ applicationId: string; locale: Locale }>) {
  const { t } = useTranslation();
  const [application, setApplication] = useState<Application | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<Application["files"][number] | null>(null);

  useEffect(() => {
    let active = true;
    requestApi(
      `/api/v1/admin/vendors/applications/${applicationId}`,
      applicationResponseSchema,
      t("auth.requestFailed"),
    )
      .then(({ application: result }) => {
        if (active) setApplication(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [applicationId, t]);

  async function review(action: ReviewAction) {
    if (!application) return;
    const text = message.trim();
    if (action !== "approve" && text.length < 3) {
      setError(t("auth.reviewReason"));
      return;
    }

    if (
      action === "approve" &&
      !window.confirm(t("admin.applications.confirmApprove"))
    ) {
      return;
    }
    if (
      action === "reject" &&
      !window.confirm(t("admin.applications.confirmReject"))
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const path =
        action === "request-information"
          ? `/api/v1/admin/vendors/applications/${application.id}/request-information`
          : `/api/v1/admin/vendors/applications/${application.id}/${action}`;
      const body =
        action === "approve"
          ? { note: text || undefined }
          : action === "reject"
            ? { reason: text }
            : { message: text };
      const result = await requestApi(
        path,
        applicationResponseSchema,
        t("auth.requestFailed"),
        postJson(body),
      );
      setApplication((current) =>
        current ? { ...current, ...result.application } : result.application,
      );
      setMessage("");
      setNotice(
        action === "approve"
          ? t("admin.applications.approved")
          : action === "reject"
            ? t("admin.applications.rejected")
            : t("admin.applications.changesRequested"),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function reviewChange(action: "approve" | "reject") {
    if (!application?.pendingChangeRequest) return;
    const text = message.trim();
    if (action === "reject" && text.length < 3) {
      setError(t("auth.reviewReason"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        `/api/v1/admin/vendors/profile-changes/${application.pendingChangeRequest.id}/${action}`,
        z.object({ changeRequest: z.object({ id: z.string(), status: z.string() }) }),
        t("auth.requestFailed"),
        postJson(action === "approve" ? { note: text || undefined } : { reason: text }),
      );
      setApplication((current) => current ? { ...current, pendingChangeRequest: null } : current);
      setNotice(action === "approve" ? t("vendor.changesApproved") : t("vendor.changesRejected"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function retryEmail(event: NonNullable<Application["emailDeliveries"]>[number]["event"]) {
    if (!application) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestApi(
        `/api/v1/admin/vendors/applications/${application.id}/email-retry`,
        applicationResponseSchema,
        t("auth.requestFailed"),
        postJson({ event }),
      );
      setApplication(result.application);
      setNotice(t("admin.applications.retryEmail"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  const canReview =
    application?.applicationStatus === "PENDING" ||
    application?.applicationStatus === "UNDER_REVIEW";

  return (
    <section>
      <Link
        href={`/${locale}/admin/vendors/applications`}
        className="text-sm font-semibold text-[#8b5e08] hover:underline"
      >
        ← {t("auth.reviewApplications")}
      </Link>
      <h2 className="mt-4 text-2xl font-bold text-[#123b35]">
        {t("admin.applications.detailsTitle")}
      </h2>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-[#123b35]">{notice}</p>}
      {!application && !error && (
        <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
      {application && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e1e9e5] bg-white p-5">
            <div>
              <p className="text-lg font-bold text-[#123b35]">
                {application.storeName ?? application.businessName ?? "—"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {application.businessName ?? "—"} · {application.user.email}
              </p>
            </div>
            <span className="rounded-full bg-[#f5f8f6] px-3 py-1 text-sm font-semibold text-[#123b35]">
              {statusLabel(application.applicationStatus, t)}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 rounded-xl border border-[#e1e9e5] bg-white p-5 sm:grid-cols-2">
            {Object.entries(fieldLabels).map(([field, labelKey]) => (
              <div key={field} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t(labelKey)}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-[#123b35]">
                  {application[field as keyof typeof fieldLabels] || "—"}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("auth.email")}
              </dt>
              <dd className="mt-1 break-all text-sm text-[#123b35]">
                {application.user.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("auth.verificationStatus")}
              </dt>
              <dd className="mt-1 text-sm text-[#123b35]">
                {application.user.hasAmazonIdentity
                  ? "VERIFIED"
                  : application.verificationStatus}
              </dd>
            </div>
            {application.submittedAt && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("auth.submitApplication")}
                </dt>
                <dd className="mt-1 text-sm text-[#123b35]">
                  {new Date(application.submittedAt).toLocaleString(locale)}
                </dd>
              </div>
            )}
            {application.reviewedAt && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("auth.statusTitle")}
                </dt>
                <dd className="mt-1 text-sm text-[#123b35]">
                  {new Date(application.reviewedAt).toLocaleString(locale)}
                </dd>
              </div>
            )}
          </dl>
          <section className="mt-4 grid gap-4 rounded-xl border border-[#e1e9e5] bg-white p-5 sm:grid-cols-2">
            {application.files.map((file) => (
              <div key={file.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {file.fileType === "STORE_LOGO" ? t("auth.storeLogo") : t("auth.businessLicense")}
                </p>
                {file.mimeType.startsWith("image/") ? (
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    className="mt-2 block text-start text-sm font-semibold text-[#8b5e08] hover:underline"
                  >
                    {file.originalName}
                    <Image
                      src={`/api/v1/vendor/application-files/${file.id}`}
                      alt={file.fileType === "STORE_LOGO" ? t("auth.storeLogo") : t("auth.businessLicense")}
                      width={128}
                      height={128}
                      unoptimized
                      className="mt-3 size-32 rounded-xl border border-[#e1e9e5] object-cover"
                    />
                  </button>
                ) : (
                  <a
                    href={`/api/v1/vendor/application-files/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-sm font-semibold text-[#8b5e08] hover:underline"
                  >
                    {file.originalName}
                  </a>
                )}
              </div>
            ))}
            {application.files.length === 0 && (
              <p className="text-sm text-slate-600">{t("admin.applications.noFiles")}</p>
            )}
          </section>
          {previewFile && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              role="dialog"
              aria-modal="true"
              aria-label={previewFile.originalName}
              onClick={() => setPreviewFile(null)}
            >
              <button
                type="button"
                aria-label={t("auth.closeMenu")}
                onClick={() => setPreviewFile(null)}
                className="absolute end-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#123b35]"
              >
                ×
              </button>
              <div
                className="relative h-[90vh] w-[95vw]"
                onClick={(event) => event.stopPropagation()}
              >
                <Image
                  src={`/api/v1/vendor/application-files/${previewFile.id}`}
                  alt={previewFile.originalName}
                  fill
                  sizes="95vw"
                  unoptimized
                  className="rounded-lg object-contain shadow-2xl"
                />
              </div>
            </div>
          )}

          {application.informationRequest && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-[#123b35]">
                {t("auth.informationRequest")}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {application.informationRequest}
              </p>
            </div>
          )}
          {application.rejectionReason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-5">
              <h3 className="font-semibold text-[#123b35]">
                {t("auth.rejectionReason")}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {application.rejectionReason}
              </p>
            </div>
          )}

          {application.emailDeliveries && (
            <section className="mt-4 rounded-xl border border-[#e1e9e5] bg-white p-5">
              <h3 className="font-semibold text-[#123b35]">
                {t("admin.applications.emailNotifications")}
              </h3>
              <div className="mt-3 space-y-3">
                {application.emailDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e7ece9] p-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#123b35]">{delivery.event}</p>
                      <p className="text-slate-600">{delivery.recipientEmail}</p>
                      <p className="text-xs text-slate-500">
                        {delivery.sentAt
                          ? t("admin.applications.emailAccepted")
                          : delivery.lastError
                            ? `${t("admin.applications.emailFailed")}: ${delivery.lastError}`
                            : t("admin.applications.emailPending")}
                        {" · "}
                        {t("admin.applications.attempts")}: {delivery.attemptCount}
                        {delivery.lastAttemptAt
                          ? ` · ${t("admin.applications.lastAttempt")}: ${new Date(delivery.lastAttemptAt).toLocaleString(locale)}`
                          : ""}
                      </p>
                    </div>
                    {!delivery.sentAt && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void retryEmail(delivery.event)}
                        className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold text-[#123b35] disabled:opacity-60"
                      >
                        {t("admin.applications.retryEmail")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {application.pendingChangeRequest && (
            <section className="mt-4 rounded-xl border border-[#f4b942] bg-white p-5">
              <h3 className="font-semibold text-[#123b35]">{t("vendor.proposedValues")}</h3>
              <p className="mt-1 text-sm text-slate-600">{t("vendor.pendingReviewDescription")}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(application.pendingChangeRequest.proposed).map(([field, value]) => (
                  <div key={field}>
                    <dt className="text-xs font-semibold uppercase text-slate-500">{field}</dt>
                    <dd className="mt-1 text-sm">{String(value)}</dd>
                  </div>
                ))}
              </dl>
              {application.pendingChangeRequest.vendorNote && (
                <p className="mt-3 text-sm text-slate-700">{application.pendingChangeRequest.vendorNote}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                {application.pendingChangeRequest.files.map((file) => (
                  file.mimeType.startsWith("image/") ? (
                    <Image key={file.id} src={`/api/v1/vendor/profile-change-files/${file.id}`} alt={file.originalName} width={96} height={96} unoptimized className="size-24 rounded-xl object-cover" />
                  ) : (
                    <a key={file.id} href={`/api/v1/vendor/profile-change-files/${file.id}`} className="text-sm font-semibold text-[#8b5e08]">{file.originalName}</a>
                  )
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewChange("approve")}
                  className="rounded-lg bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t("vendor.approveChanges")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewChange("reject")}
                  className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-60"
                >
                  {t("vendor.rejectChanges")}
                </button>
              </div>
            </section>
          )}

          {canReview && (
            <div className="mt-5 rounded-xl border border-[#e1e9e5] bg-white p-5">
              <label className="grid gap-1.5 text-sm font-medium text-[#123b35]">
                {t("auth.decisionNote")}
                <textarea
                  rows={3}
                  value={message}
                  disabled={busy}
                  onChange={(event) => setMessage(event.target.value)}
                  className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm outline-none focus:border-[#123b35]"
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void review("approve")}
                  className="rounded-lg bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t("auth.approve")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void review("reject")}
                  className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-60"
                >
                  {t("auth.reject")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void review("request-information")}
                  className="rounded-lg border border-[#d5dfda] px-4 py-2.5 text-sm font-semibold text-[#123b35] disabled:opacity-60"
                >
                  {t("auth.requestInformationAction")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function statusLabel(
  status: Application["applicationStatus"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  const translations = {
    DRAFT: "auth.status.draft",
    PENDING: "auth.status.pending",
    UNDER_REVIEW: "auth.status.underReview",
    CHANGES_REQUESTED: "auth.status.changesRequested",
    APPROVED: "auth.status.approved",
    REJECTED: "auth.status.rejected",
    SUSPENDED: "auth.status.suspended",
  } as const;
  return t(translations[status]);
}
