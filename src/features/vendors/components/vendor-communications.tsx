"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
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
  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi("/api/v1/vendor/notifications", z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }), t("auth.requestFailed"));
      setItems(result.notifications);
      setUnread(result.unreadCount);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [t]);
  useVisiblePolling(loadNotifications, 30_000);

  function localHref(href: string) {
    return `/${locale}${href}`;
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">{t("vendor.notificationsTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600">{unread} unread</p>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <button type="button" onClick={() => void requestApi("/api/v1/vendor/notifications/read", z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }), t("auth.requestFailed"), postJson({})).then((result) => { setItems(result.notifications); setUnread(result.unreadCount); })} className="rounded-xl border px-3 py-2 text-sm font-semibold">
          Mark all read
        </button>
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
              <button type="button" onClick={() => void requestApi("/api/v1/vendor/notifications/read", z.object({ notifications: z.array(notificationSchema), unreadCount: z.number() }), t("auth.requestFailed"), postJson({ id: item.id })).then((result) => { setItems(result.notifications); setUnread(result.unreadCount); })} className="mt-3 text-sm font-semibold text-[#8b5e08]">
                Mark read
              </button>
            )}
          </article>
        ))}
        {items.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-600">{t("vendor.noNotificationsDescription")}</p>}
      </div>
    </section>
  );
}
