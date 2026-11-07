"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";
import { getRecaptchaToken } from "@/lib/recaptcha/client";
import {
  businessTypeOptions,
  countries,
  findCountry,
  findRegion,
  normalizePhone,
} from "@/features/vendors/data/location-data";

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
  district: string;
  address: string;
  marketAssociation: string;
  mobileMoneyNumber: string;
};

const fieldLabels = {
  businessName: "auth.businessName",
  storeName: "auth.storeName",
  description: "auth.businessDescription",
  contactName: "auth.contactName",
  marketAssociation: "auth.marketAssociation",
  mobileMoneyNumber: "auth.mobileMoneyNumber",
} as const;

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
  businessName: z.string().nullable(),
  storeName: z.string().nullable(),
  businessType: z.string().nullable(),
  description: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  marketAssociation: z.string().nullable(),
  mobileMoneyNumber: z.string().nullable(),
  files: z.array(z.object({
    id: z.string(),
    fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
    mimeType: z.string(),
    originalName: z.string(),
    sizeBytes: z.number(),
  })),
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
  district: "",
  address: "",
  marketAssociation: "",
  mobileMoneyNumber: "",
};
const requiredFields: ReadonlyArray<keyof ApplicationFields> = [
  "businessName",
  "storeName",
  "businessType",
  "description",
  "contactName",
  "phone",
  "country",
  "region",
  "city",
  "address",
  "mobileMoneyNumber",
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
  const [phoneCountry, setPhoneCountry] = useState("Somalia");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [businessTypeOther, setBusinessTypeOther] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [uploadedTypes, setUploadedTypes] = useState<string[]>([]);

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
        for (const key of Object.keys(emptyFields) as Array<keyof ApplicationFields>) {
          nextFields[key] = application[key] ?? "";
        }
        const country = application.country ?? "";
        setPhoneCountry(country || "Somalia");
        const phoneCode = findCountry(country)?.callingCode ?? "";
        setPhoneLocal(
          application.phone?.replace(
            new RegExp(`^${phoneCode.replace("+", "\\+")}`),
            "",
          ) ?? "",
        );
        if (application.businessType && !businessTypeOptions.includes(application.businessType as typeof businessTypeOptions[number])) {
          nextFields.businessType = "Other";
          setBusinessTypeOther(application.businessType);
        }
        setFields(nextFields);
        setApplicationId(application.id);
        setUploadedTypes(application.files.map((file) => file.fileType));
        setApplicationStatus(application.applicationStatus);
        setEditable(
          application.applicationStatus === "DRAFT" ||
            application.applicationStatus === "CHANGES_REQUESTED",
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
          ...postJson({
            ...fields,
            businessType: fields.businessType === "Other" ? businessTypeOther : fields.businessType,
            phone: phoneLocal.trim() ? normalizePhone(phoneCountry, phoneLocal) : "",
          }),
          method: applicationId ? "PATCH" : "POST",
        },
      );
      setApplicationId(saved.application.id);
      setApplicationStatus(saved.application.applicationStatus);
      for (const [file, fileType] of [
        [logoFile, "STORE_LOGO"],
        [licenseFile, "BUSINESS_LICENSE"],
      ] as const) {
        if (!file) continue;
        const formData = new FormData();
        formData.set("file", file);
        formData.set("fileType", fileType);
        const response = await fetch("/api/v1/vendor/onboarding/files", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const payload = (await response.json()) as { data?: { file: { fileType: string } }; error?: { message?: string } };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? t("auth.requestFailed"));
        }
        setUploadedTypes((current) => [...new Set([...current, payload.data!.file.fileType])]);
      }

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
    const missing = requiredFields.some((key) => fields[key].trim() === "") ||
      !phoneLocal.trim() ||
      (fields.businessType === "Other" && !businessTypeOther.trim()) ||
      (!logoFile && !uploadedTypes.includes("STORE_LOGO")) ||
      (!licenseFile && !uploadedTypes.includes("BUSINESS_LICENSE"));
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
              {t(labelKey)}{required ? " *" : ""}
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
        <FileField
          id="application-storeLogo"
          label={t("auth.storeLogo")}
          accept="image/jpeg,image/png,image/webp"
          file={logoFile}
          uploaded={uploadedTypes.includes("STORE_LOGO")}
          disabled={!editable || busy}
          onChange={setLogoFile}
        />
        <FileField
          id="application-businessLicense"
          label={t("auth.businessLicense")}
          accept="application/pdf,image/jpeg,image/png,image/webp"
          file={licenseFile}
          uploaded={uploadedTypes.includes("BUSINESS_LICENSE")}
          disabled={!editable || busy}
          onChange={setLicenseFile}
        />
        <SearchableSelect
          id="application-businessType"
          label={t("auth.businessType")}
          value={fields.businessType}
          options={businessTypeOptions.map((value) => ({ label: value, value }))}
          disabled={!editable || busy}
          onChange={(value) => setFields((current) => ({ ...current, businessType: value }))}
        />
        {fields.businessType === "Other" && (
          <TextField
            id="application-businessTypeOther"
            label={t("auth.businessTypeOther")}
            value={businessTypeOther}
            disabled={!editable || busy}
            onChange={(value) => setBusinessTypeOther(value)}
          />
        )}
        <div className="grid gap-1.5 text-sm font-medium text-[#123b35]">
          <span>{t("auth.phone")}</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)]">
            <label htmlFor="application-phoneCountry" className="sr-only">
              {t("auth.phoneCountry")}
            </label>
            <select
              id="application-phoneCountry"
              value={phoneCountry}
              disabled={!editable || busy}
              onChange={(event) => {
                setPhoneCountry(event.target.value);
                setPhoneLocal("");
                setFields((current) => ({ ...current, phone: "" }));
              }}
              className={inputClass}
              aria-label={t("auth.phoneCountry")}
            >
              {countries.map((country) => (
                <option key={country.code} value={country.name}>
                  {country.flag} {country.callingCode}
                </option>
              ))}
            </select>
            <input
              id="application-phone"
              type="tel"
              value={phoneLocal}
              required
              disabled={!editable || busy}
              onChange={(event) => {
                setPhoneLocal(event.target.value);
                setFields((current) => ({
                  ...current,
                  phone: normalizePhone(phoneCountry, event.target.value),
                }));
              }}
              placeholder={findCountry(phoneCountry)?.callingCode}
              className={inputClass}
            />
          </div>
        </div>
        <TextField
          id="application-mobileMoneyNumber"
          label={`${t("auth.mobileMoneyNumber")} *`}
          value={fields.mobileMoneyNumber}
          disabled={!editable || busy}
          onChange={(value) =>
            setFields((current) => ({
              ...current,
              mobileMoneyNumber: value.trim()
                ? normalizePhone(phoneCountry, value)
                : "",
            }))
          }
        />
        <SearchableSelect
          id="application-country"
          label={t("auth.country")}
          value={fields.country}
          options={countries.map((country) => ({ label: `${country.flag} ${country.name}`, value: country.name }))}
          disabled={!editable || busy}
          required
          onChange={(value) =>
            setFields((current) => ({
              ...current,
              country: value,
              region: "",
              city: "",
              district: "",
              address: "",
            }))
          }
        />
        <LocationSelect
          id="application-region"
          label={t("auth.region")}
          value={fields.region}
          options={findCountry(fields.country)?.regions.map((region) => region.name) ?? []}
          otherLabel={t("auth.otherLocation")}
          disabled={!editable || busy || !fields.country}
          required
          onChange={(value) => setFields((current) => ({ ...current, region: value, city: "", district: "", address: "" }))}
        />
        <LocationSelect
          id="application-city"
          label={t("auth.city")}
          value={fields.city}
          options={Object.keys(findRegion(fields.country, fields.region)?.cities ?? {})}
          otherLabel={t("auth.otherLocation")}
          disabled={!editable || busy || !fields.region}
          required
          onChange={(value) => setFields((current) => ({ ...current, city: value, district: "", address: "" }))}
        />
        <LocationSelect
          id="application-district"
          label={t("auth.district")}
          value={fields.district}
          options={findRegion(fields.country, fields.region)?.districts?.[fields.city] ?? []}
          otherLabel={t("auth.otherLocation")}
          disabled={!editable || busy || !fields.city}
          onChange={(value) => setFields((current) => ({ ...current, district: value }))}
        />
        <TextField
          id="application-address"
          label={`${t("auth.address")} *`}
          value={fields.address}
          disabled={!editable || busy}
          onChange={(value) => setFields((current) => ({ ...current, address: value }))}
        />
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

function TextField({
  id,
  label,
  value,
  disabled,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-[#123b35]">
      {label}
      <input id={id} type="text" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

function FileField({
  id,
  label,
  accept,
  file,
  uploaded,
  disabled,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  accept: string;
  file: File | null;
  uploaded: boolean;
  disabled: boolean;
  onChange: (file: File | null) => void;
}>) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-[#123b35]">
      {label} *
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className={inputClass}
      />
      <span className="text-xs font-normal text-slate-500">
        {file?.name ?? (uploaded ? "Uploaded" : "Required")}
      </span>
    </label>
  );
}

function SearchableSelect({
  id,
  label,
  value,
  options,
  disabled,
  required = false,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  disabled: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}>) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-[#123b35]">
      {label}
      <input
        id={id}
        list={`${id}-options`}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
        }}
        onFocus={() => setQuery("")}
        className={inputClass}
        placeholder={label}
      />
      <datalist id={`${id}-options`}>
        {visible.map((option) => <option key={option.value} value={option.value} />)}
      </datalist>
    </label>
  );
}

function LocationSelect({
  options,
  otherLabel,
  ...props
}: Readonly<{
  id: string;
  label: string;
  value: string;
  options: string[];
  otherLabel: string;
  disabled: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}>) {
  const hasOther = props.value === "Other" || (props.value !== "" && !options.includes(props.value));
  return (
    <div className="grid gap-2">
      <SearchableSelect {...props} options={[...options.map((value) => ({ label: value, value })), { label: otherLabel, value: "Other" }]} />
      {hasOther && (
        <input
          type="text"
          value={props.value === "Other" ? "" : props.value}
          disabled={props.disabled}
          placeholder={otherLabel}
          onChange={(event) => props.onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </div>
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
    CHANGES_REQUESTED: "auth.status.changesRequested",
    APPROVED: "auth.status.approved",
    REJECTED: "auth.status.rejected",
    SUSPENDED: "auth.status.suspended",
  }[status] as
    | "auth.status.notStarted"
    | "auth.status.draft"
    | "auth.status.pending"
    | "auth.status.underReview"
    | "auth.status.changesRequested"
    | "auth.status.approved"
    | "auth.status.rejected"
    | "auth.status.suspended"
    | undefined;
  return key ? t(key) : status;
}
