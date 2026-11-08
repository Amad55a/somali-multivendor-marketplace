"use client";

import Link from "next/link";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { postFormData, postJson, requestApi } from "@/lib/api/client";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";

const profileSchema = z.object({
  profile: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
    hasProfilePhoto: z.boolean(),
  }),
});

export function CustomerProfile({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<z.infer<typeof profileSchema>["profile"] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void requestApi("/api/v1/customer/profile", profileSchema, t("auth.requestFailed"))
      .then(({ profile: result }) => {
        if (!active) return;
        setProfile(result);
        setDisplayName(result.displayName ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
      });
    return () => { active = false; };
  }, [t]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { profile: updated } = await requestApi(
        "/api/v1/customer/profile",
        profileSchema,
        t("auth.requestFailed"),
        { ...postJson({ displayName }), method: "PATCH" },
      );
      setProfile(updated);
      setDisplayName(updated.displayName ?? "");
      setNotice(t("customerDashboard.profileSaved"));
      window.dispatchEvent(new Event("customer-profile-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePhoto() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.set("file", photo);
    try {
      await requestApi(
        "/api/v1/customer/profile/photo",
        z.object({ updated: z.literal(true) }),
        t("auth.requestFailed"),
        postFormData(form),
      );
      setProfile((current) => current ? { ...current, hasProfilePhoto: true } : current);
      setPhoto(null);
      setPhotoPreview(null);
      setNotice(t("customerDashboard.photoSaved"));
      window.dispatchEvent(new Event("customer-profile-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi("/api/v1/customer/profile/photo", z.object({ updated: z.literal(true) }), t("auth.requestFailed"), { method: "DELETE" });
      setProfile((current) => current ? { ...current, hasProfilePhoto: false } : current);
      setPhoto(null);
      setPhotoPreview(null);
      setNotice(t("customerDashboard.photoSaved"));
      window.dispatchEvent(new Event("customer-profile-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <p className="text-sm font-semibold text-[#a06c0b]">{t("customerDashboard.profile")}</p>
      <h1 className="mt-2 text-3xl font-bold text-[#123b35]">{t("customerDashboard.profile")}</h1>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-green-800">{notice}</p>}
      {!profile ? (
        <p className="mt-6 text-sm text-slate-600">{t("header.searchLoading")}</p>
      ) : (
        <div className="mt-6 grid gap-5">
          <form onSubmit={save} className="grid gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <label className="grid gap-1.5 text-sm font-semibold text-[#123b35]">
              {t("customerDashboard.profileName")}
              <input value={displayName} minLength={2} maxLength={160} required onChange={(event) => setDisplayName(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal" />
            </label>
            <div className="grid gap-1 text-sm">
              <span className="font-semibold text-[#123b35]">{t("customerDashboard.profileEmail")}</span>
              <span className="text-slate-600">{profile.email}</span>
            </div>
            <div className="grid gap-1 text-sm">
              <span className="font-semibold text-[#123b35]">{t("auth.emailVerified")}</span>
              <span className="text-slate-600">{profile.emailVerified ? t("admin.settings.enabled") : t("admin.settings.notEnabled")}</span>
            </div>
            <button type="submit" disabled={busy} className="min-h-11 justify-self-start rounded-xl bg-[#123b35] px-4 text-sm font-bold text-white disabled:opacity-50">{t("customerDashboard.saveProfile")}</button>
          </form>
          <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#123b35]">{t("customerDashboard.profilePhoto")}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {photoPreview ? (
                <Image src={photoPreview} alt={t("customerDashboard.profilePhoto")} width={72} height={72} unoptimized className="size-[72px] rounded-full object-cover" />
              ) : profile.hasProfilePhoto ? (
                <Image src={`/api/v1/customer/profile/photo?updated=${encodeURIComponent(profile.id)}`} alt={t("customerDashboard.profilePhoto")} width={72} height={72} unoptimized className="size-[72px] rounded-full object-cover" />
              ) : (
                <span className="grid size-[72px] place-items-center rounded-full bg-[#123b35] text-2xl font-bold text-[#f4b942]">{(profile.displayName || profile.email).slice(0, 1).toUpperCase()}</span>
              )}
              <div className="grid gap-2">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const selectedFile = event.target.files?.[0] ?? null;
                  setPhoto(selectedFile);
                  setPhotoPreview(selectedFile ? URL.createObjectURL(selectedFile) : null);
                }} className="max-w-full text-sm" />
                <button type="button" disabled={!photo || busy} onClick={() => void savePhoto()} className="min-h-10 justify-self-start rounded-xl border border-[#d5dfda] px-4 text-sm font-semibold text-[#123b35] disabled:opacity-50">{t("customerDashboard.uploadPhoto")}</button>
                {profile.hasProfilePhoto && <button type="button" disabled={busy} onClick={() => void removePhoto()} className="min-h-10 justify-self-start text-sm font-semibold text-red-700 disabled:opacity-50">Remove photo</button>}
                <span className="text-xs text-slate-500">JPEG, PNG, or WebP; 64–6000 px per side, up to 25 megapixels and 5 MB.</span>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Link href={`/${locale}/users/${profile.id}`} className="text-xs font-semibold text-[#8b5e08] hover:underline">View your public profile →</Link>
            </div>
          </section>
          <p className="text-xs text-slate-500">{new Date(profile.createdAt).toLocaleDateString(locale)}</p>
        </div>
      )}
    </main>
  );
}
