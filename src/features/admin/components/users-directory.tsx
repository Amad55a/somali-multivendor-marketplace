"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import type { AccountType } from "../../../../generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";

const userSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  accountType: z.enum(["CUSTOMER", "VENDOR", "ADMIN"]),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  vendorApplicationStatus: z
    .enum([
      "DRAFT",
      "PENDING",
      "UNDER_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
      "REJECTED",
      "SUSPENDED",
    ])
    .nullable(),
});
const usersResponseSchema = z.object({
  users: z.array(userSchema),
  nextCursor: z.string().nullable(),
});
type AdminUser = z.infer<typeof userSchema>;

const roles: Array<AccountType | "ALL"> = [
  "ALL",
  "CUSTOMER",
  "VENDOR",
  "ADMIN",
];

export function UsersDirectory({
  locale,
  initialAccountType,
  initialVendorStatus,
}: Readonly<{
  locale: Locale;
  initialAccountType?: AccountType;
  initialVendorStatus?: AdminUser["vendorApplicationStatus"];
}>) {
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState<AccountType | "ALL">(
    initialAccountType ?? "ALL",
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (nextCursor?: string) => {
      const query = new URLSearchParams({ limit: "50" });
      if (accountType !== "ALL") query.set("accountType", accountType);
      if (active !== "ALL") query.set("active", active);
      if (initialVendorStatus) query.set("vendorStatus", initialVendorStatus);
      if (search) query.set("search", search);
      if (nextCursor) query.set("cursor", nextCursor);
      return requestApi(
        `/api/v1/admin/users?${query}`,
        usersResponseSchema,
        t("auth.requestFailed"),
      );
    },
    [accountType, active, initialVendorStatus, search, t],
  );

  useEffect(() => {
    let active = true;
    fetchPage()
      .then((result) => {
        if (!active) return;
        setUsers(result.users);
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

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage(cursor);
      setUsers((current) => [...current, ...result.users]);
      setCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <section>
      <h2 className="text-2xl font-bold text-[#123b35]">
        {t("admin.users.title")}
      </h2>
      <form
        onSubmit={applySearch}
        className="mt-5 grid gap-3 rounded-xl border border-[#e1e9e5] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_14rem_14rem_auto]"
      >
        <label className="grid gap-1 text-sm font-medium text-[#123b35]">
          {t("admin.applications.search")}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
            className="min-h-10 rounded-lg border border-[#d5dfda] px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#123b35]">
          {t("admin.users.accountStatus")}
          <select
            value={active}
            onChange={(event) => {
              setLoading(true);
              setActive(event.target.value as "ALL" | "ACTIVE" | "INACTIVE");
            }}
            className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-3 text-sm"
          >
            <option value="ACTIVE">{t("admin.users.active")}</option>
            <option value="INACTIVE">{t("admin.users.suspended")}</option>
            <option value="ALL">{t("admin.users.allStatuses")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#123b35]">
          {t("admin.users.role")}
          <select
            value={accountType}
            onChange={(event) => {
              setLoading(true);
              setAccountType(
                event.target.value === "ALL"
                  ? "ALL"
                  : (event.target.value as AccountType),
              );
            }}
            className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-3 text-sm"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role === "ALL"
                  ? t("admin.users.allRoles")
                  : role === "CUSTOMER"
                    ? t("auth.customer")
                    : role === "VENDOR"
                      ? t("auth.vendor")
                      : t("auth.adminLoginTitle")}
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

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {loading && users.length === 0 && (
        <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
      {!loading && users.length === 0 && !error && (
        <p className="mt-5 rounded-xl bg-white p-5 text-sm text-slate-600">
          {t("admin.users.noResults")}
        </p>
      )}
      {users.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-[#e1e9e5] bg-white">
          <table className="w-full min-w-[70rem] border-collapse text-left text-sm">
            <thead className="bg-[#f5f8f6] text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">{t("admin.users.name")}</th>
                <th className="px-4 py-3">{t("admin.users.email")}</th>
                <th className="px-4 py-3">{t("admin.users.role")}</th>
                <th className="px-4 py-3">{t("admin.users.verification")}</th>
                <th className="px-4 py-3">{t("admin.users.registrationDate")}</th>
                <th className="px-4 py-3">{t("admin.users.applicationStatus")}</th>
                <th className="px-4 py-3">{t("admin.users.accountStatus")}</th>
                <th className="px-4 py-3">{t("admin.users.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ece9]">
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  locale={locale}
                  onChanged={(userId) =>
                    setUsers((current) => current.filter((entry) => entry.id !== userId))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className="mt-5 rounded-lg border border-[#d5dfda] px-4 py-2.5 text-sm font-semibold text-[#123b35] disabled:opacity-60"
        >
          {t("auth.submit")}
        </button>
      )}
    </section>
  );
}

function UserRow({
  user,
  locale,
  onChanged,
}: {
  user: AdminUser;
  locale: Locale;
  onChanged: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<"suspend" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function performAction() {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        dialog === "suspend"
          ? `/api/v1/admin/users/${user.id}/suspend`
          : `/api/v1/admin/users/${user.id}`,
        {
          method: dialog === "suspend" ? "POST" : "DELETE",
          credentials: "same-origin",
          headers: dialog === "suspend" ? { "Content-Type": "application/json" } : undefined,
          body: dialog === "suspend" ? "{}" : undefined,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? t("auth.requestFailed"));
      }
      onChanged(user.id);
      setDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <tr>
      <td className="px-4 py-3 text-[#123b35]">{user.name ?? "—"}</td>
      <td className="px-4 py-3 text-slate-700">{user.email}</td>
      <td className="px-4 py-3">{user.accountType}</td>
      <td className="px-4 py-3">
        {user.emailVerified ? t("admin.users.verified") : t("admin.users.unverified")}
      </td>
      <td className="px-4 py-3">
        {new Date(user.createdAt).toLocaleDateString(locale)}
      </td>
      <td className="px-4 py-3">
        {user.vendorApplicationStatus
          ? applicationStatusLabel(user.vendorApplicationStatus, t)
          : "—"}
      </td>
      <td className="px-4 py-3">{user.isActive ? t("admin.users.active") : t("admin.users.suspended")}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {user.isActive && (
            <button type="button" onClick={() => setDialog("suspend")} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
              {t("admin.users.suspend")}
            </button>
          )}
          <button type="button" onClick={() => setDialog("delete")} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700">
            {t("admin.users.delete")}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      </td>
    </tr>
    {dialog && (
      <tr>
        <td colSpan={8}>
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#123b35]/40 p-4">
            <div role="dialog" aria-modal="true" aria-label={t("admin.users.confirmTitle")} className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-2xl">
            <p className="font-semibold text-red-900">{t("admin.users.confirmTitle")}</p>
            <p className="mt-1 text-sm text-slate-700">
              {dialog === "delete" ? t("admin.users.deleteConfirmation") : t("admin.users.suspendConfirmation")}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void performAction()} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? t("header.searchLoading") : t("admin.users.confirm")}
              </button>
              <button type="button" disabled={busy} onClick={() => setDialog(null)} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold text-[#123b35]">
                {t("admin.users.cancel")}
              </button>
            </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

function applicationStatusLabel(
  status: NonNullable<AdminUser["vendorApplicationStatus"]>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const translation = {
    DRAFT: "auth.status.draft",
    PENDING: "auth.status.pending",
    UNDER_REVIEW: "auth.status.underReview",
    CHANGES_REQUESTED: "auth.status.changesRequested",
    APPROVED: "auth.status.approved",
    REJECTED: "auth.status.rejected",
    SUSPENDED: "auth.status.suspended",
  } as const;
  return t(translation[status]);
}
