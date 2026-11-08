"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { useLocaleContext } from "@/i18n/locale-provider";
import { postJson, requestApi } from "@/lib/api/client";
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

const responseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number(),
});

type VendorNotification = z.infer<typeof notificationSchema>;

export function VendorNotificationBell() {
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VendorNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      const result = await requestApi(
        "/api/v1/vendor/notifications",
        responseSchema,
        t("auth.requestFailed"),
      );
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
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("vendor-notifications-updated", loadNotifications);
    return () => window.removeEventListener("vendor-notifications-updated", loadNotifications);
  }, [loadNotifications]);

  async function markRead(id?: string) {
    try {
      const result = await requestApi(
        "/api/v1/vendor/notifications/read",
        responseSchema,
        t("auth.requestFailed"),
        postJson(id ? { id } : {}),
      );
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
      setError(null);
      window.dispatchEvent(new Event("vendor-notifications-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  function localHref(href: string | null) {
    const internalPath = href?.replace(/^\/(en|so)(?=\/|$)/, "");
    if (!internalPath?.startsWith("/") || internalPath.startsWith("//") || internalPath.includes("\\")) {
      return `/${locale}/vendor/notifications`;
    }
    return `/${locale}${internalPath}`;
  }

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${t("vendor.notificationBellLabel")}${unreadCount ? `, ${unreadCount} ${t("vendor.unreadNotifications")}` : ""}`}
        aria-expanded={open}
        aria-controls="vendor-notification-panel"
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 place-items-center rounded-xl border border-[#dce4e1] text-[#123b35] hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -end-1 -top-1 min-w-5 rounded-full bg-[#f4b942] px-1 text-center text-[10px] font-bold leading-5 text-[#123b35]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          id="vendor-notification-panel"
          aria-label={t("vendor.notificationBellLabel")}
          className="absolute end-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#dce4e1] bg-white text-[#123b35] shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e7ece9] p-4">
            <div className="min-w-0">
              <h2 className="truncate font-bold">{t("vendor.recentNotifications")}</h2>
              <p className="mt-1 text-xs text-slate-600">
                {unreadCount} {t("vendor.unreadNotifications")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markRead()}
              disabled={unreadCount === 0 || loading}
              className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-semibold text-[#8b5e08] hover:bg-[#fff8e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("vendor.markAllRead")}
            </button>
          </div>
          {error && <p role="alert" className="px-4 pt-3 text-sm text-red-700">{error}</p>}
          {loading ? (
            <p className="p-5 text-sm text-slate-600">{t("vendor.loadingNotifications")}</p>
          ) : (
            <div className="max-h-[min(60vh,28rem)] overflow-y-auto">
              {items.slice(0, 5).map((item) => (
                <article
                  key={item.id}
                  className={`border-b border-[#e7ece9] p-4 last:border-b-0 ${item.readAt ? "bg-white" : "bg-[#fff8e8]"}`}
                >
                  <Link
                    href={localHref(item.href)}
                    onClick={() => setOpen(false)}
                    className="block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
                  >
                    <p className="flex items-start gap-2 font-semibold">
                      {!item.readAt && <span aria-label={t("vendor.unreadNotifications")} className="mt-1.5 size-2 shrink-0 rounded-full bg-[#c58b1b]" />}
                      <span>{locale === "so" ? item.titleSo : item.title}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{locale === "so" ? item.bodySo : item.body}</p>
                    <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(locale)}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.readAt ? t("vendor.notificationRead") : t("vendor.notificationUnread")}</p>
                  </Link>
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      className="mt-2 min-h-9 rounded-lg px-2 text-xs font-semibold text-[#8b5e08] hover:bg-white"
                    >
                      {t("vendor.markRead")}
                    </button>
                  )}
                </article>
              ))}
              {items.length === 0 && !error && (
                <p className="p-5 text-center text-sm text-slate-600">{t("vendor.noNotificationsDescription")}</p>
              )}
            </div>
          )}
          <Link
            href={`/${locale}/vendor/notifications`}
            onClick={() => setOpen(false)}
            className="block min-h-11 border-t border-[#e7ece9] px-4 py-3 text-center text-sm font-semibold text-[#123b35] hover:bg-[#f1f5f3]"
          >
            {t("vendor.viewAllNotifications")}
          </Link>
        </section>
      )}
    </div>
  );
}
