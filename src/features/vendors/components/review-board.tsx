"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";

const reviewApplicationSchema = z.object({
  id: z.string(),
  applicationStatus: z.string(),
  businessName: z.string().nullable(),
  storeName: z.string().nullable(),
  businessType: z.string().nullable(),
  description: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  submittedAt: z.string().nullable(),
  pendingProfileChange: z.boolean().optional(),
  user: z.object({ id: z.string(), email: z.string() }),
});
const listSchema = z.object({
  applications: z.array(reviewApplicationSchema),
  nextCursor: z.string().nullable(),
});
const reviewedSchema = z.object({ application: z.object({ id: z.string() }) });
type ReviewApplication = z.infer<typeof reviewApplicationSchema>;

export function ReviewBoard() {
  const { t, locale } = useTranslation();
  const [applications, setApplications] = useState<ReviewApplication[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (nextCursor?: string) => {
      const query = new URLSearchParams({ limit: "50" });
      if (statusFilter !== "ALL") query.set("status", statusFilter);
      if (search) query.set("search", search);
      if (nextCursor) query.set("cursor", nextCursor);
      return requestApi(
        `/api/v1/admin/vendors/applications?${query}`,
        listSchema,
        t("auth.requestFailed"),
      );
    },
    [search, statusFilter, t],
  );

  useEffect(() => {
    let active = true;
    fetchPage()
      .then((result) => {
        if (!active) return;
        setApplications(result.applications);
        setCursor(result.nextCursor);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPage, t]);

  const load = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchPage(nextCursor);
        setApplications((current) =>
          nextCursor ? [...current, ...result.applications] : result.applications,
        );
        setCursor(result.nextCursor);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, t],
  );

  async function review(
    application: ReviewApplication,
    action: "approve" | "reject" | "request-information" | "suspend",
  ) {
    const text = notes[application.id]?.trim() ?? "";
    if (
      (action === "reject" || action === "request-information" || action === "suspend") &&
      !text
    ) {
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

    setBusyId(application.id);
    setError(null);
    try {
      const path =
        action === "suspend"
          ? `/api/v1/admin/vendors/${application.user.id}/suspend`
          : `/api/v1/admin/vendors/applications/${application.id}/${action}`;
      const body =
        action === "reject" || action === "suspend"
          ? { reason: text }
          : action === "request-information"
            ? { message: text }
            : { note: text || undefined };

      await requestApi(
        path,
        reviewedSchema,
        t("auth.requestFailed"),
        postJson(body),
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#123b35]">
            {t("auth.reviewApplications")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{t("auth.statusDescription")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold text-[#123b35] disabled:opacity-60"
        >
          {t("auth.submit")}
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
        className="mt-5 grid gap-3 rounded-xl border border-[#e1e9e5] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]"
      >
        <label className="grid gap-1 text-sm font-medium text-[#123b35]">
          {t("admin.applications.search")}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("admin.applications.searchPlaceholder")}
            className="min-h-10 rounded-lg border border-[#d5dfda] px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#123b35]">
          {t("admin.applications.statusFilter")}
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-3 text-sm"
          >
            <option value="ALL">{t("admin.applications.allSubmitted")}</option>
            {[
              "PENDING",
              "UNDER_REVIEW",
              "CHANGES_REQUESTED",
              "APPROVED",
              "REJECTED",
              "SUSPENDED",
            ].map((status) => (
              <option key={status} value={status}>
                {statusLabel(status, t)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-lg bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white"
        >
          {t("admin.applications.search")}
        </button>
      </form>

      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      {loading && applications.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
      {!loading && applications.length === 0 && (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-slate-600">
          {t("admin.applications.noResults")}
        </p>
      )}

      <div className="mt-6 grid gap-4">
        {applications.map((application) => {
          const canReview =
            application.applicationStatus === "PENDING" ||
            application.applicationStatus === "UNDER_REVIEW";
          const canSuspend = application.applicationStatus === "APPROVED";
          return (
            <article
              key={application.id}
              className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm sm:p-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/${locale}/admin/vendors/applications/${application.id}`}
                    className="text-lg font-bold text-[#123b35] hover:underline"
                  >
                    {application.storeName ?? application.businessName}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {application.businessName} · {application.businessType}
                  </p>
                </div>
                <Link
                  href={`/${locale}/admin/vendors/applications/${application.id}`}
                  className="mt-3 inline-flex text-sm font-semibold text-[#8b5e08] hover:underline"
                >
                  {t("admin.applications.viewDetails")}
                </Link>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#f5f8f6] px-3 py-1 text-xs font-semibold text-[#123b35]">
                    {statusLabel(application.applicationStatus, t)}
                  </span>
                  {application.pendingProfileChange && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                      {t("vendor.pendingReview")}
                    </span>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-500">{application.contactName}</dt>
                  <dd className="text-slate-700">{application.user.email}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">{application.phone}</dt>
                  <dd className="text-slate-700">
                    {[application.city, application.region].filter(Boolean).join(", ")}
                  </dd>
                </div>
              </dl>
              {application.description && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {application.description}
                </p>
              )}

              {(canReview || canSuspend) && (
                <div className="mt-5 grid gap-3 border-t border-[#e7ece9] pt-5">
                  <label className="grid gap-1.5 text-sm font-medium text-[#123b35]">
                    {t("auth.decisionNote")}
                    <textarea
                      rows={2}
                      value={notes[application.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [application.id]: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm outline-none focus:border-[#123b35]"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {canReview && (
                      <>
                        <ActionButton
                          label={t("auth.approve")}
                          disabled={busyId === application.id}
                          onClick={() => void review(application, "approve")}
                          primary
                        />
                        <ActionButton
                          label={t("auth.reject")}
                          disabled={busyId === application.id}
                          onClick={() => void review(application, "reject")}
                        />
                        <ActionButton
                          label={t("auth.requestInformationAction")}
                          disabled={busyId === application.id}
                          onClick={() => void review(application, "request-information")}
                        />
                      </>
                    )}
                    {canSuspend && (
                      <ActionButton
                        label={t("auth.suspend")}
                        disabled={busyId === application.id}
                        onClick={() => void review(application, "suspend")}
                      />
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {cursor && (
        <button
          type="button"
          onClick={() => void load(cursor)}
          disabled={loading}
          className="mt-6 rounded-lg border border-[#d5dfda] px-4 py-3 text-sm font-semibold text-[#123b35] disabled:opacity-60"
        >
          {t("auth.submit")}
        </button>
      )}
    </section>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
  primary = false,
}: Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
        primary
          ? "bg-[#123b35] text-white hover:bg-[#1d5149]"
          : "border border-[#d5dfda] text-[#123b35] hover:bg-[#f5f8f6]"
      }`}
    >
      {label}
    </button>
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
