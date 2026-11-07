"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";

const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
  actorEmail: z.string().nullable(),
});
const auditLogsResponseSchema = z.object({
  auditLogs: z.array(auditLogSchema),
  nextCursor: z.string().nullable(),
});
type AuditLog = z.infer<typeof auditLogSchema>;

export function AdminAuditLogs({ locale }: Readonly<{ locale: Locale }>) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (nextCursor?: string) => {
      const query = new URLSearchParams({ limit: "50" });
      if (nextCursor) query.set("cursor", nextCursor);
      return requestApi(
        `/api/v1/admin/audit-logs?${query}`,
        auditLogsResponseSchema,
        t("auth.requestFailed"),
      );
    },
    [t],
  );

  useEffect(() => {
    let active = true;
    fetchPage()
      .then((result) => {
        if (!active) return;
        setLogs(result.auditLogs);
        setCursor(result.nextCursor);
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
    try {
      const result = await fetchPage(cursor);
      setLogs((current) => [...current, ...result.auditLogs]);
      setCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-bold text-[#123b35]">
        {t("admin.auditLogs.title")}
      </h2>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {loading && logs.length === 0 && (
        <p className="mt-5 text-sm text-slate-600">{t("header.searchLoading")}</p>
      )}
      {!loading && logs.length === 0 && !error && (
        <p className="mt-5 rounded-xl bg-white p-5 text-sm text-slate-600">
          {t("admin.auditLogs.noResults")}
        </p>
      )}
      {logs.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-[#e1e9e5] bg-white">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="bg-[#f5f8f6] text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">{t("admin.auditLogs.action")}</th>
                <th className="px-4 py-3">{t("admin.auditLogs.entity")}</th>
                <th className="px-4 py-3">{t("admin.auditLogs.actor")}</th>
                <th className="px-4 py-3">{t("admin.auditLogs.date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ece9]">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 font-medium text-[#123b35]">{log.action}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId}` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.actorEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {new Date(log.createdAt).toLocaleString(locale)}
                  </td>
                </tr>
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
