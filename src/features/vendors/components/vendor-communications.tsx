"use client";

import Link from "next/link";
import { MessagesSquare, Headset } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleSo: z.string(),
  body: z.string(),
  bodySo: z.string(),
  href: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export function VendorCommunications() {
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const [items, setItems] = useState<z.infer<typeof notificationSchema>[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi(
        "/api/v1/vendor/notifications",
        z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }),
        t("auth.requestFailed"),
      );
      setItems(result.notifications);
      setUnread(result.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useVisiblePolling(loadNotifications, 30_000);
  useEffect(() => {
    window.addEventListener("vendor-notifications-updated", loadNotifications);
    return () => window.removeEventListener("vendor-notifications-updated", loadNotifications);
  }, [loadNotifications]);

  function localHref(href: string) {
    const internalPath = href.replace(/^\/(en|so)(?=\/|$)/, "");
    return internalPath.startsWith("/") && !internalPath.startsWith("//") && !internalPath.includes("\\")
      ? `/${locale}${internalPath}`
      : `/${locale}/vendor/notifications`;
  }

  async function markRead(id?: string) {
    try {
      const result = await requestApi(
        "/api/v1/vendor/notifications/read",
        z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }),
        t("auth.requestFailed"),
        postJson(id ? { id } : {}),
      );
      setItems(result.notifications);
      setUnread(result.unreadCount);
      setError(null);
      window.dispatchEvent(new Event("vendor-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">{t("vendor.communicationsTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{t("vendor.communicationsDescription")}</p>
        </div>
        <button
          type="button"
          disabled={!unread}
          onClick={() => void markRead()}
          className="min-h-11 shrink-0 rounded-xl border border-[#d5dfda] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("vendor.markAllRead")}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`/${locale}/vendor/messages`} className="flex min-h-28 items-start gap-3 rounded-2xl border border-[#e1e9e5] bg-white p-4 hover:border-[#123b35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]">
          <MessagesSquare className="mt-1 size-5 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-semibold">{t("vendor.messagesLinkLabel")}</span>
            <span className="mt-1 block text-sm text-slate-600">{t("vendor.messagesLinkDescription")}</span>
          </span>
        </Link>
        <Link href={`/${locale}/vendor/help/tickets`} className="flex min-h-28 items-start gap-3 rounded-2xl border border-[#e1e9e5] bg-white p-4 hover:border-[#123b35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]">
          <Headset className="mt-1 size-5 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-semibold">{t("vendor.supportLinkLabel")}</span>
            <span className="mt-1 block text-sm text-slate-600">{t("vendor.supportLinkDescription")}</span>
          </span>
        </Link>
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{t("vendor.notificationsSectionTitle")}</h3>
          <p className="mt-1 text-sm text-slate-600">{unread} {t("vendor.unreadNotifications")}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <article key={item.id} className={`rounded-2xl border p-4 ${item.readAt ? "border-[#e1e9e5] bg-white" : "border-[#f4b942] bg-[#fff8e8]"}`}>
            <Link href={localHref(item.href ?? "/vendor/notifications")} className="block rounded focus-visible:outline-2">
              <p className="font-semibold">{locale === "so" ? item.titleSo : item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{locale === "so" ? item.bodySo : item.body}</p>
              <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(locale)}</p>
            </Link>
            {!item.readAt && (
              <button type="button" onClick={() => void markRead(item.id)} className="mt-3 min-h-10 rounded-lg px-2 text-sm font-semibold text-[#8b5e08] hover:bg-white">
                {t("vendor.markRead")}
              </button>
            )}
          </article>
        ))}
        {loading && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{t("vendor.loadingNotifications")}</p>}
        {items.length === 0 && !loading && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{t("vendor.noNotificationsDescription")}</p>}
      </div>
    </section>
  );
}
