"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { postJson, requestApi } from "@/lib/api/client";
import { useLocaleContext } from "@/i18n/locale-provider";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleSo: z.string(),
  body: z.string(),
  bodySo: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  href: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
const responseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number(),
});

export function CustomerNotifications() {
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const [notifications, setNotifications] = useState<z.infer<typeof notificationSchema>[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi("/api/v1/customer/notifications", responseSchema, t("auth.requestFailed"));
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadNotifications, 30_000);
  useEffect(() => {
    window.addEventListener("customer-notifications-updated", loadNotifications);
    return () => window.removeEventListener("customer-notifications-updated", loadNotifications);
  }, [loadNotifications]);

  function localHref(href: string) {
    return `/${locale}${href}`;
  }

  async function markRead(id?: string) {
    try {
      const result = await requestApi(
        "/api/v1/customer/notifications/read",
        responseSchema,
        t("auth.requestFailed"),
        postJson(id ? { id } : {}),
      );
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setError(null);
      window.dispatchEvent(new Event("customer-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#123b35]">{t("customerDashboard.notifications")}</h1>
          <p className="mt-2 text-sm text-slate-600">{unreadCount} {t("customerDashboard.unread")}</p>
        </div>
        <button type="button" disabled={!unreadCount} onClick={() => void markRead()} className="rounded-xl border border-[#d5dfda] px-4 py-2 text-sm font-semibold text-[#123b35] disabled:opacity-50">{t("customerDashboard.markAllRead")}</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-3">
        {notifications.map((item) => (
          <article key={item.id} className={`rounded-2xl border p-4 ${item.readAt ? "border-[#e1e9e5] bg-white" : "border-[#f4b942] bg-[#fff8e8]"}`}>
            {item.href ? (
              <Link href={localHref(item.href)} className="block rounded focus-visible:outline-2">
                <p className="font-semibold text-[#123b35]">{locale === "so" ? item.titleSo : item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{locale === "so" ? item.bodySo : item.body}</p>
                <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(locale)}</p>
              </Link>
            ) : (
              <>
                <p className="font-semibold text-[#123b35]">{locale === "so" ? item.titleSo : item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{locale === "so" ? item.bodySo : item.body}</p>
                <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(locale)}</p>
              </>
            )}
            {!item.readAt && <button type="button" onClick={() => void markRead(item.id)} className="mt-3 text-sm font-semibold text-[#8b5e08]">{t("customerDashboard.markRead")}</button>}
          </article>
        ))}
        {notifications.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{t("customerDashboard.emptyNotifications")}</p>}
      </div>
    </main>
  );
}
