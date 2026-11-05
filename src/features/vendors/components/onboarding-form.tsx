"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";
import { getRecaptchaToken } from "@/lib/recaptcha/client";

type ApplicationFields = {
  businessName: string;
  storeName: string;
  businessType: string;
  description: string;
  contactName: string;
  phone: string;
  country: string;
  region: string;
  city: string;
  address: string;
  marketAssociation: string;
};

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
} as const;

const applicationSchema = z.object({
  id: z.string(),
  applicationStatus: z.enum([
    "DRAFT",
    "PENDING",
    "UNDER_REVIEW",
    "NEEDS_INFORMATION",
    "APPROVED",
    "REJECTED",
    "SUSPENDED",
  ]),
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
});
const onboardingSchema = z.object({ application: applicationSchema.nullable() });
const savedApplicationSchema = z.object({ application: applicationSchema });
const submittedSchema = z.object({
  application: z.object({ applicationStatus: z.string() }),
});
const emptyFields: ApplicationFields = {
  businessName: "",
  storeName: "",
  businessType: "",
  description: "",
  contactName: "",
  phone: "",
  country: "",
  region: "",
  city: "",
  address: "",
  marketAssociation: "",
};
const requiredFields: ReadonlyArray<keyof ApplicationFields> = [
  "businessName",
  "storeName",
  "businessType",
  "contactName",
  "phone",
  "country",
  "region",
  "city",
];
const inputClass =
  "min-h-11 rounded-lg border border-[#d5dfda] bg-white px-3 py-2 text-sm text-[#123b35] outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15";

export function OnboardingForm({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const [fields, setFields] = useState<ApplicationFields>(emptyFields);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] = useState("NOT_STARTED");
  const [editable, setEditable] = useState(true);
  const [busy, setBusy] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestApi(
      "/api/v1/vendor/onboarding",
      onboardingSchema,
      t("auth.requestFailed"),
    )
      .then(({ application }) => {
        if (!active || !application) return;
        const nextFields = { ...emptyFields };
        for (const key of Object.keys(fieldLabels) as Array<keyof ApplicationFields>) {
          nextFields[key] = application[key] ?? "";
        }
        setFields(nextFields);
        setApplicationId(application.id);
        setApplicationStatus(application.applicationStatus);
        setEditable(
          application.applicationStatus === "DRAFT" ||
            application.applicationStatus === "NEEDS_INFORMATION",
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setFeedback(
            error instanceof Error ? error.message : t("auth.requestFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function save(submitForReview: boolean) {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await requestApi(
        "/api/v1/vendor/onboarding",
        savedApplicationSchema,
        t("auth.requestFailed"),
        {
          ...postJson(fields),
          method: applicationId ? "PATCH" : "POST",
        },
      );
      setApplicationId(saved.application.id);
      setApplicationStatus(saved.application.applicationStatus);

      if (submitForReview) {
        const recaptchaToken = await getRecaptchaToken(
          "vendor_onboarding_submit",
        );
        const submitted = await requestApi(
          "/api/v1/vendor/onboarding/submit",
          submittedSchema,
          t("auth.requestFailed"),
          postJson({ recaptchaToken }),
        );
        setApplicationStatus(submitted.application.applicationStatus);
        router.push(`/${locale}/vendor/status`);
        router.refresh();
      } else {
        setFeedback(t("auth.saveDraft"));
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  function submitForReview() {
    const missing = requiredFields.some((key) => fields[key].trim() === "");
    if (missing) {
      setFeedback(t("auth.requestFailed"));
      return;
    }
    void save(true);
  }

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#123b35]">
            {t("auth.onboardingTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {t("auth.onboardingDescription")}
          </p>
        </div>
        <Link
          href={`/${locale}/vendor/status`}
          className="text-sm font-semibold text-[#8b5e08] hover:underline"
        >
          {t("auth.viewStatus")}
        </Link>
      </div>

      {applicationStatus !== "NOT_STARTED" && (
        <p className="mt-5 rounded-lg bg-[#f5f8f6] px-4 py-3 text-sm font-semibold text-[#123b35]">
          {statusLabel(applicationStatus, t)}
        </p>
      )}

      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {Object.entries(fieldLabels).map(([field, labelKey]) => {
          const key = field as keyof ApplicationFields;
          const required = requiredFields.includes(key);
          const isDescription = key === "description";
          return (
            <label
              key={field}
              htmlFor={`application-${field}`}
              className={`grid gap-1.5 text-sm font-medium text-[#123b35] ${isDescription ? "sm:col-span-2" : ""}`}
            >
              {t(labelKey)}
              {isDescription ? (
                <textarea
                  id={`application-${field}`}
                  value={fields[key]}
                  required={required}
                  disabled={!editable || busy}
                  rows={4}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className={inputClass}
                />
              ) : (
                <input
                  id={`application-${field}`}
                  type="text"
                  value={fields[key]}
                  required={required}
                  disabled={!editable || busy}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className={inputClass}
                />
              )}
            </label>
          );
        })}
        {feedback && (
          <p role="status" aria-live="polite" className="sm:col-span-2 text-sm text-[#123b35]">
            {feedback}
          </p>
        )}
        {editable && (
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-lg border border-[#123b35] px-4 py-2 text-sm font-semibold text-[#123b35] disabled:opacity-60"
            >
              {t("auth.saveDraft")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submitForReview}
              className="min-h-11 rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5149] disabled:opacity-60"
            >
              {t("auth.submitApplication")}
            </button>
          </div>
        )}
      </form>
      {busy && <p className="mt-4 text-sm text-slate-600">{t("header.searchLoading")}</p>}
    </section>
  );
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const key = {
    NOT_STARTED: "auth.status.notStarted",
    DRAFT: "auth.status.draft",
    PENDING: "auth.status.pending",
    UNDER_REVIEW: "auth.status.underReview",
    NEEDS_INFORMATION: "auth.status.needsInformation",
    APPROVED: "auth.status.approved",
    REJECTED: "auth.status.rejected",
    SUSPENDED: "auth.status.suspended",
  }[status] as
    | "auth.status.notStarted"
    | "auth.status.draft"
    | "auth.status.pending"
    | "auth.status.underReview"
    | "auth.status.needsInformation"
    | "auth.status.approved"
    | "auth.status.rejected"
    | "auth.status.suspended"
    | undefined;
  return key ? t(key) : status;
}
