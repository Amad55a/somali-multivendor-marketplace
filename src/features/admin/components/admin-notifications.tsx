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
  type: z.string(),
  title: z.string(),
  titleSo: z.string(),
  body: z.string(),
  bodySo: z.string(),
  href: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

const responseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number(),
});

type AdminNotification = z.infer<typeof notificationSchema>;

export function AdminNotifications() {
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi("/api/v1/admin/notifications", responseSchema, t("auth.requestFailed"));
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useVisiblePolling(loadNotifications, 30_000);
  useEffect(() => {
    window.addEventListener("admin-notifications-updated", loadNotifications);
    return () => window.removeEventListener("admin-notifications-updated", loadNotifications);
  }, [loadNotifications]);

  async function markRead(id?: string) {
    try {
      const result = await requestApi(
        "/api/v1/admin/notifications/read",
        responseSchema,
        t("auth.requestFailed"),
        postJson(id ? { id } : {}),
      );
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
      setError(null);
      window.dispatchEvent(new Event("admin-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  function localHref(href: string) {
    return href.startsWith("/admin/") ? `/${locale}${href}` : href;
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">{t("admin.notifications.title")}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {unreadCount} {t("admin.notifications.unreadCount")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markRead()}
          disabled={unreadCount === 0 || loading}
          className="rounded-xl border border-[#d5dfda] px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("admin.notifications.markAllRead")}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-slate-600">{t("header.searchLoading")}</p>
      ) : (
        <div className="mt-6 grid gap-3">
          {items.map((item) => {
            const title = locale === "so" ? item.titleSo : item.title;
            const body = locale === "so" ? item.bodySo : item.body;
            const content = (
              <>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleString(locale)}
                </p>
              </>
            );
            return (
              <article
                key={item.id}
                className={`rounded-2xl border p-4 ${
                  item.readAt
                    ? "border-[#e1e9e5] bg-white"
                    : "border-[#f4b942] bg-[#fff8e8]"
                }`}
              >
                {item.href ? (
                  <Link href={localHref(item.href)} className="block rounded focus-visible:outline-2">
                    {content}
                  </Link>
                ) : content}
                {!item.readAt && (
                  <button
                    type="button"
                    onClick={() => void markRead(item.id)}
                    className="mt-3 text-sm font-semibold text-[#8b5e08]"
                  >
                    {t("admin.notifications.markRead")}
                  </button>
                )}
              </article>
            );
          })}
          {items.length === 0 && !error && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">
              {t("admin.notifications.empty")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
