"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";
import { getRecaptchaToken } from "@/lib/recaptcha/client";
import { SomsuuqLogo } from "@/components/shared/somsuuq-logo";
import {
  getPasswordRequirements,
  getPasswordStrength,
  passwordSchema,
} from "@/features/auth/validation/schemas";

type CustomerOrVendor = "CUSTOMER" | "VENDOR";
type AuthMode =
  | "login"
  | "register"
  | "verify-email"
  | "forgot-password"
  | "reset-password"
  | "admin-login";
type AdminStep = "credentials" | "email" | "setup" | "mfa" | "recovery";

const acceptedSchema = z.object({ accepted: z.literal(true) });
const userResultSchema = z.object({
  user: z.object({ id: z.string(), accountType: z.string() }),
});
const challengeSchema = z.object({
  challengeId: z.string(),
  mfaRequired: z.boolean(),
});
const mfaSetupSchema = z.object({ setup: z.literal(true) });
const recoverySchema = z.object({
  user: z.object({ id: z.string() }),
  recoveryCodes: z.array(z.string()),
});
const verificationSchema = z.object({
  verified: z.literal(true),
  user: z.object({
    id: z.string(),
    accountType: z.enum(["CUSTOMER", "VENDOR"]),
  }),
});
const resetSchema = z.object({ reset: z.literal(true) });

export function AuthForm({
  locale,
  mode,
  initialAccountType = "CUSTOMER",
  initialEmail = "",
}: Readonly<{
  locale: Locale;
  mode: AuthMode;
  initialAccountType?: CustomerOrVendor;
  initialEmail?: string;
}>) {
  const { t } = useTranslation();
  const router = useRouter();
  const [accountType, setAccountType] =
    useState<CustomerOrVendor>(initialAccountType);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [adminStep, setAdminStep] = useState<AdminStep>("credentials");
  const [challengeId, setChallengeId] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isRegistration = mode === "register";
  const isAdmin = mode === "admin-login";
  const passwordRequirements = getPasswordRequirements(password);
  const passwordStrength = getPasswordStrength(password);
  const title = isAdmin
    ? t("auth.adminLoginTitle")
    : mode === "login"
      ? t("auth.loginTitle")
      : mode === "register"
        ? initialAccountType === "VENDOR"
          ? t("auth.vendorRegisterTitle")
          : t("auth.registerTitle")
        : mode === "verify-email"
          ? t("auth.verifyEmailTitle")
          : mode === "forgot-password"
            ? t("auth.forgotPassword")
            : t("auth.resetPassword");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      if (isRegistration) {
        if (!passwordSchema.safeParse(password).success) {
          setFeedback(t("auth.passwordRequirementsMessage"));
          return;
        }
        if (password !== confirmPassword) {
          setFeedback(t("auth.passwordMismatch"));
          return;
        }
      }

      if (mode === "login") {
        const recaptchaToken = await getRecaptchaToken(
          `${accountType.toLowerCase()}_login`,
        );
        await requestApi(
          "/api/v1/auth/login",
          userResultSchema,
          t("auth.requestFailed"),
          postJson({ email, password, accountType, recaptchaToken }),
        );
        router.push(
          accountType === "VENDOR"
            ? `/${locale}/vendor/onboarding`
            : `/${locale}/customer/account`,
        );
        router.refresh();
        return;
      }

      if (isRegistration) {
        const recaptchaToken = await getRecaptchaToken(
          `${initialAccountType.toLowerCase()}_register`,
        );
        await requestApi(
          `/api/v1/auth/${initialAccountType.toLowerCase()}/register`,
          z.object({
            user: z.object({ id: z.string(), email: z.string() }),
          }),
          t("auth.requestFailed"),
          postJson({ email, password, recaptchaToken }),
        );
        router.push(
          `/${locale}/verify-email?accountType=${initialAccountType}`,
        );
        return;
      }

      if (mode === "verify-email") {
        const result = await requestApi(
          "/api/v1/auth/email/verify",
          verificationSchema,
          t("auth.requestFailed"),
          postJson({ code }),
        );
        setFeedback(t("auth.emailVerified"));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
        router.replace(
          result.user.accountType === "VENDOR"
            ? `/${locale}/vendor/onboarding`
            : `/${locale}/customer/account`,
        );
        router.refresh();
        return;
      }

      if (mode === "forgot-password") {
        const recaptchaToken = await getRecaptchaToken("password_forgot");
        await requestApi(
          "/api/v1/auth/password/forgot",
          acceptedSchema,
          t("auth.requestFailed"),
          postJson({ email, accountType, recaptchaToken }),
        );
        setFeedback(t("auth.resetRequested"));
        return;
      }

      if (mode === "reset-password") {
        await requestApi(
          "/api/v1/auth/password/reset",
          resetSchema,
          t("auth.requestFailed"),
          postJson({ email, accountType, code, newPassword }),
        );
        setFeedback(t("auth.passwordReset"));
        return;
      }

      await submitAdminStep();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminStep() {
    if (adminStep === "credentials") {
      const recaptchaToken = await getRecaptchaToken("admin_login");
      await requestApi(
        "/api/v1/admin/auth/login",
        acceptedSchema,
        t("auth.requestFailed"),
        postJson({ email, password, recaptchaToken }),
      );
      setAdminStep("email");
      setFeedback(t("auth.adminEmailStep"));
      return;
    }

    if (adminStep === "email") {
      const challenge = await requestApi(
        "/api/v1/admin/auth/email/verify",
        challengeSchema,
        t("auth.requestFailed"),
        postJson({ email, code }),
      );
      setChallengeId(challenge.challengeId);
      setCode("");
      if (challenge.mfaRequired) {
        setAdminStep("mfa");
        setFeedback(t("auth.adminMfaStep"));
      } else {
        const secret = createMfaSecret();
        await requestApi(
          "/api/v1/admin/auth/mfa/setup",
          mfaSetupSchema,
          t("auth.requestFailed"),
          postJson({ challengeId: challenge.challengeId, secret }),
        );
        setMfaSecret(secret);
        setAdminStep("setup");
        setFeedback(t("auth.setupMfa"));
      }
      return;
    }

    if (adminStep === "setup") {
      const result = await requestApi(
        "/api/v1/admin/auth/mfa/enable",
        recoverySchema,
        t("auth.requestFailed"),
        postJson({ challengeId, code }),
      );
      setRecoveryCodes(result.recoveryCodes);
      setAdminStep("recovery");
      setFeedback(null);
      router.refresh();
      return;
    }

    if (adminStep === "mfa") {
      await requestApi(
        "/api/v1/admin/auth/mfa/verify",
        userResultSchema,
        t("auth.requestFailed"),
        postJson({ challengeId, code }),
      );
      router.replace(`/${locale}/admin/vendors/applications`);
      router.refresh();
      return;
    }

    router.replace(`/${locale}/admin/vendors/applications`);
  }

  async function resendCode() {
    setBusy(true);
    setFeedback(null);
    try {
      await requestApi(
        "/api/v1/auth/email/resend",
        acceptedSchema,
        t("auth.requestFailed"),
        postJson({
          recaptchaToken: await getRecaptchaToken("email_resend"),
        }),
      );
      setFeedback(t("auth.emailSent"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resendAdminCode() {
    setBusy(true);
    setFeedback(null);
    try {
      await requestApi(
        "/api/v1/admin/auth/login",
        acceptedSchema,
        t("auth.requestFailed"),
        postJson({
          email,
          password,
          recaptchaToken: await getRecaptchaToken("admin_login"),
        }),
      );
      setFeedback(t("auth.adminEmailStep"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function beginAmazonLogin() {
    const type = isRegistration ? initialAccountType : accountType;
    setBusy(true);
    setFeedback(null);
    try {
      const recaptchaToken = await getRecaptchaToken(
        `${type.toLowerCase()}_login`,
      );
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/v1/auth/amazon";
      form.hidden = true;
      for (const [name, value] of Object.entries({
        accountType: type,
        locale,
        recaptchaToken,
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("auth.requestFailed"));
      setBusy(false);
    }
  }

  if (isAdmin && adminStep === "recovery") {
    return (
      <AuthShell
        title={title}
        locale={locale}
        welcomeTitle={t("auth.loginWelcome")}
        welcomeDescription={t("auth.loginStory")}
      >
        <p className="text-sm leading-6 text-slate-600">
          {t("auth.recoveryCodesNotice")}
        </p>
        <h2 className="mt-5 text-sm font-semibold text-[#123b35]">
          {t("auth.recoveryCodes")}
        </h2>
        <ul className="mt-3 grid gap-2 rounded-xl bg-[#f5f8f6] p-4 font-mono text-sm text-[#123b35] sm:grid-cols-2">
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.replace(`/${locale}/admin/vendors/applications`)}
          className="mt-6 w-full rounded-lg bg-[#123b35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d5149]"
        >
          {t("auth.continueToAdmin")}
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={title}
      description={isAdmin ? undefined : mode === "login" ? t("auth.loginDescription") : undefined}
      welcomeTitle={
        isRegistration ? t("auth.registerWelcome") : t("auth.loginWelcome")
      }
      welcomeDescription={
        isRegistration ? t("auth.registerStory") : t("auth.loginStory")
      }
      locale={locale}
    >
      {isAdmin && adminStep === "setup" && (
        <div className="mb-5 rounded-xl border border-[#dce4e1] bg-[#f5f8f6] p-4">
          <p className="text-xs font-semibold text-[#123b35]">
            {t("auth.authenticatorSecret")}
          </p>
          <p className="mt-2 break-all font-mono text-sm tracking-wider text-[#123b35]">
            {mfaSecret}
          </p>
        </div>
      )}

      {mode === "verify-email" && (
        <p className="mb-5 text-sm leading-6 text-slate-600">
          {t("auth.verifyEmailDescription")}
        </p>
      )}

      {isAdmin && adminStep !== "credentials" && (
        <p className="mb-5 text-sm leading-6 text-slate-600">
          {adminStep === "email" ? t("auth.adminEmailStep") : t("auth.adminMfaStep")}
        </p>
      )}

      <form className="grid gap-4" onSubmit={submit}>
        {mode !== "verify-email" &&
          (!isAdmin || adminStep === "credentials" || adminStep === "email") && (
            <Field label={t("auth.email")} htmlFor="auth-email">
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
              />
            </Field>
          )}

        {(mode === "login" ||
          mode === "forgot-password" ||
          mode === "reset-password") && (
          <Field label={t("auth.accountType")} htmlFor="auth-account-type">
            <select
              id="auth-account-type"
              value={accountType}
              onChange={(event) =>
                setAccountType(event.target.value as CustomerOrVendor)
              }
              className={inputClass}
            >
              <option value="CUSTOMER">{t("auth.customer")}</option>
              <option value="VENDOR">{t("auth.vendor")}</option>
            </select>
          </Field>
        )}

        {(mode === "login" ||
          isRegistration ||
          (isAdmin && adminStep === "credentials")) && (
          <Field label={t("auth.password")} htmlFor="auth-password">
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegistration ? "new-password" : "current-password"}
                minLength={isRegistration ? 12 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={isRegistration ? "password-guidance" : undefined}
                className={`${inputClass} w-full pe-20`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-pressed={showPassword}
                className="absolute inset-y-0 end-3 my-auto text-xs font-semibold text-[#123b35] underline"
              >
                {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            </div>
            {isRegistration && (
              <div id="password-guidance" className="mt-2 grid gap-2 text-xs">
                <p className="font-semibold text-[#123b35]" aria-live="polite">
                  {t(`auth.passwordStrength.${passwordStrength}`)}
                </p>
                <ul className="grid gap-1 text-slate-600 sm:grid-cols-2">
                  {(
                    [
                      ["length", t("auth.passwordRuleLength")],
                      ["uppercase", t("auth.passwordRuleUppercase")],
                      ["lowercase", t("auth.passwordRuleLowercase")],
                      ["number", t("auth.passwordRuleNumber")],
                      ["symbol", t("auth.passwordRuleSymbol")],
                    ] as const
                  ).map(([key, label]) => (
                    <li
                      key={key}
                      className={
                        passwordRequirements[key]
                          ? "font-medium text-[#123b35]"
                          : undefined
                      }
                    >
                      <span aria-hidden="true">
                        {passwordRequirements[key] ? "✓ " : "○ "}
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Field>
        )}

        {isRegistration && (
          <Field label={t("auth.confirmPassword")} htmlFor="auth-confirm-password">
            <input
              id="auth-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {mode === "reset-password" && (
          <Field label={t("auth.newPassword")} htmlFor="auth-new-password">
            <div className="relative">
              <input
                id="auth-new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={`${inputClass} w-full pe-20`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-pressed={showPassword}
                className="absolute inset-y-0 end-3 my-auto text-xs font-semibold text-[#123b35] underline"
              >
                {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            </div>
          </Field>
        )}

        {(mode === "verify-email" ||
          mode === "reset-password" ||
          (isAdmin && adminStep !== "credentials")) && (
          <Field label={t("auth.verificationCode")} htmlFor="auth-code">
            <input
              id="auth-code"
              type="text"
              inputMode={isAdmin && adminStep !== "email" ? "text" : "numeric"}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {feedback && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg bg-[#f5f8f6] px-3 py-2 text-sm text-[#123b35]"
          >
            {feedback}
          </p>
        )}

        {mode === "login" && (
          <Link
            href={`/${locale}/forgot-password?accountType=${accountType}`}
            className="text-sm font-semibold text-[#8b5e08] hover:underline"
          >
            {t("auth.forgotPassword")}
          </Link>
        )}

        {mode === "verify-email" && (
          <button
            type="button"
            disabled={busy}
            onClick={resendCode}
            className="text-start text-sm font-semibold text-[#8b5e08] hover:underline disabled:opacity-60"
          >
            {t("auth.resendCode")}
          </button>
        )}

        {isAdmin && adminStep === "email" && (
          <button
            type="button"
            disabled={busy}
            onClick={resendAdminCode}
            className="text-start text-sm font-semibold text-[#8b5e08] hover:underline disabled:opacity-60"
          >
            {t("auth.resendCode")}
          </button>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-[#123b35] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1d5149] disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? t("header.searchLoading") : submitLabel(mode, isAdmin, adminStep, t)}
        </button>

        {(mode === "login" || mode === "register") && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3 py-1 text-[11px] font-medium tracking-[0.16em] text-slate-400">
              <span className="h-px flex-1 bg-[#e7ece9]" />
              <span>{t("auth.or")}</span>
              <span className="h-px flex-1 bg-[#e7ece9]" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void beginAmazonLogin()}
              className="flex min-h-11 items-center justify-center gap-2.5 rounded-lg border border-[#dce4e1] bg-white px-4 py-3 text-sm font-semibold text-[#202124] transition hover:bg-[#f8faf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35] disabled:cursor-wait disabled:opacity-60"
            >
              <Image
                src="https://www.amazon.com/favicon.ico"
                alt=""
                aria-hidden="true"
                width={22}
                height={22}
                className="size-[22px] object-contain"
                unoptimized
              />
              <span>{t("auth.amazonSignIn")}</span>
            </button>
            {mode === "login" ? (
              <p className="text-center text-sm text-slate-600">
                {t("auth.noAccount")}{" "}
                <Link
                  href={`/${locale}/${accountType === "VENDOR" ? "vendor/register" : "register"}`}
                  className="font-semibold text-[#8b5e08] hover:underline"
                >
                  {t("auth.createAccount")}
                </Link>
              </p>
            ) : (
              <p className="text-center text-sm text-slate-600">
                {t("auth.haveAccount")}{" "}
                <Link
                  href={`/${locale}/login`}
                  className="font-semibold text-[#8b5e08] hover:underline"
                >
                  {t("auth.backToLogin")}
                </Link>
              </p>
            )}
          </div>
        )}
      </form>

      {isRegistration && initialAccountType === "CUSTOMER" && (
        <p className="mt-5 text-center text-sm text-slate-600">
          <Link
            href={`/${locale}/vendor/register`}
            className="font-semibold text-[#8b5e08] hover:underline"
          >
            {t("auth.vendorRegistration")}
          </Link>
        </p>
      )}
      {mode !== "login" && mode !== "register" && (
        <Link
          href={`/${locale}/login`}
          className="mt-5 inline-block text-sm font-semibold text-[#8b5e08] hover:underline"
        >
          {t("auth.backToLogin")}
        </Link>
      )}
    </AuthShell>
  );
}

function AuthShell({
  title,
  description,
  welcomeTitle,
  welcomeDescription,
  locale,
  children,
}: Readonly<{
  title: string;
  description?: string;
  welcomeTitle: string;
  welcomeDescription: string;
  locale: Locale;
  children: ReactNode;
}>) {
  return (
    <main className="min-h-dvh bg-white md:grid md:grid-cols-2">
      <div
        className="relative flex min-h-56 items-end overflow-hidden bg-cover bg-center px-6 py-7 text-white md:hidden"
        style={{
          backgroundImage:
            "linear-gradient(90deg,rgba(18,59,53,.86),rgba(18,59,53,.38)),url('/images/hero/somsuuq-marketplace-hero.png')",
        }}
      >
        <div className="flex w-full flex-col items-start gap-5">
          <SomsuuqLogo locale={locale} inverse />
          <p className="mt-3 max-w-sm text-2xl font-semibold leading-tight">
            {welcomeTitle}
          </p>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/85">
            {welcomeDescription}
          </p>
        </div>
      </div>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10 md:min-h-dvh md:px-12 lg:px-20">
        <div className="w-full max-w-md">
          <SomsuuqLogo locale={locale} />
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-[#123b35] sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          )}
          <div className="mt-7">{children}</div>
        </div>
      </section>

      <aside
        aria-label={welcomeTitle}
        className="relative hidden min-h-dvh flex-col overflow-hidden bg-cover bg-center p-12 text-white md:flex lg:p-16"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(9,38,33,.1) 0%,rgba(9,38,33,.88) 100%),url('/images/hero/somsuuq-marketplace-hero.png')",
        }}
      >
        <div className="absolute inset-0 bg-[#123b35]/15" />
        <div className="relative">
          <SomsuuqLogo locale={locale} inverse />
        </div>
        <div className="relative mt-auto max-w-xl">
          <h2 className="text-4xl font-bold leading-tight lg:text-5xl">
            {welcomeTitle}
          </h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/85">
            {welcomeDescription}
          </p>
        </div>
      </aside>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: Readonly<{ label: string; htmlFor: string; children: ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5 text-sm font-medium text-[#123b35]">
      {label}
      {children}
    </label>
  );
}

function submitLabel(
  mode: AuthMode,
  isAdmin: boolean,
  adminStep: AdminStep,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isAdmin) {
    return adminStep === "credentials" || adminStep === "email"
      ? t("auth.submit")
      : adminStep === "setup"
        ? t("auth.setupMfa")
        : t("auth.submit");
  }
  if (mode === "register") return t("auth.createAccount");
  if (mode === "login") return t("header.signIn");
  if (mode === "verify-email") return t("auth.submit");
  if (mode === "forgot-password") return t("auth.requestReset");
  return t("auth.resetPassword");
}

function createMfaSecret(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let buffer = 0;
  let bits = 0;
  let secret = "";

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      secret += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) secret += alphabet[(buffer << (5 - bits)) & 31];
  return secret;
}

const inputClass =
  "min-h-11 rounded-lg border border-[#d5dfda] bg-white px-3 py-2 text-sm text-[#123b35] outline-none focus:border-[#123b35] focus:ring-2 focus:ring-[#123b35]/15";
