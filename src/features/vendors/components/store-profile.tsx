"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postFormData, postJson, requestApi } from "@/lib/api/client";
import { getRecaptchaToken } from "@/lib/recaptcha/client";

const fileSchema = z.object({
  id: z.string(),
  fileType: z.enum(["STORE_LOGO", "BUSINESS_LICENSE"]),
  mimeType: z.string(),
  originalName: z.string(),
});
const changeRequestSchema = z.object({
  id: z.string(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]),
  proposed: z.record(z.string(), z.unknown()),
  vendorNote: z.string().nullable().optional(),
  submittedAt: z.union([z.string(), z.date()]).nullable().optional(),
  files: z.array(fileSchema),
});
const savedSchema = z.object({ changeRequest: changeRequestSchema });

type Profile = {
  storeName: string | null;
  businessName: string | null;
  description: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  businessType: string | null;
  marketAssociation: string | null;
  mobileMoneyNumber: string | null;
  submittedAt: Date | string | null;
  files: Array<{ id: string; fileType: "STORE_LOGO" | "BUSINESS_LICENSE"; mimeType: string }>;
  applicationStatus: string;
  verificationStatus: string;
  user?: { displayName: string | null };
  changeRequests?: Array<{
    id: string;
    status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
    proposed: unknown;
    vendorNote: string | null;
    submittedAt: Date | string | null;
    files: Array<{ id: string; fileType: "STORE_LOGO" | "BUSINESS_LICENSE"; mimeType: string; originalName: string }>;
  }>;
};

export function StoreProfile({ profile }: Readonly<{ profile: Profile | null }>) {
  const { t, locale } = useTranslation();
  const logo = profile?.files.find((file) => file.fileType === "STORE_LOGO");
  const pending = profile?.changeRequests?.find((request) => request.status === "PENDING");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.user?.displayName ?? "");
  const [storeName, setStoreName] = useState(profile?.storeName ?? "");
  const [businessName, setBusinessName] = useState(profile?.businessName ?? "");
  const [businessType, setBusinessType] = useState(profile?.businessType ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [contactPhone, setContactPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [marketAssociation, setMarketAssociation] = useState(profile?.marketAssociation ?? "");
  const [vendorNote, setVendorNote] = useState("");
  const [hasPending, setHasPending] = useState(Boolean(pending));
  const [newLogoId, setNewLogoId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const recaptchaToken = await getRecaptchaToken("vendor_profile_change_submit");
      const fields: Record<string, string> = {};
      if (displayName.trim()) fields.displayName = displayName.trim();
      if (storeName.trim()) fields.storeName = storeName.trim();
      if (businessName.trim()) fields.businessName = businessName.trim();
      if (businessType.trim()) fields.businessType = businessType.trim();
      if (description.trim()) fields.description = description.trim();
      if (contactPhone.trim()) fields.phone = contactPhone.trim();
      if (address.trim()) fields.address = address.trim();
      if (marketAssociation.trim()) fields.marketAssociation = marketAssociation.trim();
      if (vendorNote.trim()) fields.vendorNote = vendorNote.trim();
      const result = await requestApi(
        "/api/v1/vendor/profile-changes/submit",
        savedSchema,
        t("auth.requestFailed"),
        postJson({ recaptchaToken, ...fields }),
      );
      setHasPending(true);
      setEditing(false);
      setMessage(t("vendor.changesSubmitted"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("fileType", "STORE_LOGO");
    try {
      const result = await requestApi(
        "/api/v1/vendor/profile-changes/files",
        z.object({ file: fileSchema, changeRequest: changeRequestSchema }),
        t("auth.requestFailed"),
        postFormData(form),
      );
      setNewLogoId(result.file.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  const submittedLabel = profile?.submittedAt
    ? new Date(profile.submittedAt).toLocaleDateString(locale)
    : t("vendor.notAvailable");

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#a06c0b]">{t("vendor.storeEyebrow")}</p>
          <h2 className="mt-1 text-3xl font-bold">{t("vendor.storeTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("vendor.storeDescription")}</p>
        </div>
        <span className="rounded-full bg-[#e6f4ed] px-3 py-1 text-xs font-semibold text-[#176044]">
          {profile?.applicationStatus ?? "APPROVED"}
        </span>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      <div className="mt-6 rounded-2xl border border-[#e1e9e5] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f5f8f6]">
            {logo ? (
              <Image src={`/api/v1/vendor/application-files/${logo.id}`} alt={t("vendor.storeLogoAlt")} width={96} height={96} unoptimized className="size-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-[#123b35]">{profile?.storeName?.slice(0, 1) ?? "S"}</span>
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold">{profile?.storeName ?? t("vendor.storeNameUnset")}</h3>
            <p className="mt-1 text-sm text-slate-500">{profile?.businessName ?? t("vendor.businessNameUnset")} · {profile?.businessType ?? t("vendor.businessTypeUnset")}</p>
            <p className="mt-2 text-sm text-slate-600">{t("vendor.submitted")} {submittedLabel} · {profile?.verificationStatus ?? "UNVERIFIED"}</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("auth.businessDescription")}</dt><dd className="mt-1 text-sm">{profile?.description ?? t("vendor.noDescription")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("auth.phone")}</dt><dd className="mt-1 text-sm">{profile?.phone ?? t("vendor.notProvided")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("vendor.location")}</dt><dd className="mt-1 text-sm">{[profile?.district, profile?.city, profile?.region, profile?.country].filter(Boolean).join(", ") || t("vendor.notProvided")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("auth.address")}</dt><dd className="mt-1 text-sm">{profile?.address ?? t("vendor.notProvided")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("auth.marketAssociation")}</dt><dd className="mt-1 text-sm">{profile?.marketAssociation ?? t("vendor.notProvided")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-500">{t("vendor.payoutNumber")}</dt><dd className="mt-1 text-sm">{profile?.mobileMoneyNumber ? `••••${profile.mobileMoneyNumber.slice(-4)}` : t("vendor.notProvided")}</dd></div>
        </dl>
        <p className="mt-6 rounded-xl bg-[#f5f8f6] p-4 text-sm text-slate-600">{t("vendor.profileLocked")}</p>
        {hasPending && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <strong>{t("vendor.pendingReview")}</strong>
            <span className="mt-1 block">{t("vendor.pendingReviewDescription")}</span>
          </p>
        )}
        {!hasPending && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="mt-4 rounded-xl bg-[#123b35] px-4 py-2.5 text-sm font-semibold text-white">
            {t("vendor.requestChanges")}
          </button>
        )}
        {editing && !hasPending && (
          <form onSubmit={submit} className="mt-6 grid gap-4 border-t border-[#e1e9e5] pt-6">
            <p className="text-sm text-slate-600">{t("vendor.requestChangesDescription")}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">{t("vendor.displayName")}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("auth.storeName")}<input value={storeName} onChange={(event) => setStoreName(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("auth.businessName")}<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("auth.businessType")}<input value={businessType} onChange={(event) => setBusinessType(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">{t("auth.businessDescription")}<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("auth.phone")}<input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("auth.address")}<input value={address} onChange={(event) => setAddress(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">{t("auth.marketAssociation")}<input value={marketAssociation} onChange={(event) => setMarketAssociation(event.target.value)} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("vendor.newLogo")}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); }} className="font-normal" /></label>
              {newLogoId && <Image src={`/api/v1/vendor/profile-change-files/${newLogoId}`} alt={t("vendor.storeLogoAlt")} width={80} height={80} unoptimized className="size-20 rounded-xl object-cover" />}
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">{t("vendor.vendorNote")}<textarea value={vendorNote} onChange={(event) => setVendorNote(event.target.value)} rows={2} className="rounded-xl border border-[#d5dfda] px-3 py-2.5 font-normal" /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} type="submit" className="rounded-xl bg-[#f4b942] px-4 py-2.5 font-bold text-[#123b35] disabled:opacity-60">{saving ? t("vendor.submitting") : t("vendor.submitChanges")}</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-[#d5dfda] px-4 py-2.5 font-semibold">{t("vendor.cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
