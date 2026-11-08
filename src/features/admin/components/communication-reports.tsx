"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { requestApi } from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

const reportSchema = z.object({
  id: z.string(),
  reason: z.enum(["SPAM", "HARASSMENT", "FRAUD", "IMPERSONATION", "INAPPROPRIATE_CONTENT", "OTHER"]),
  explanation: z.string().nullable(),
  status: z.enum(["OPEN", "INVESTIGATING", "DISMISSED", "ACTIONED"]),
  decisionReason: z.string().nullable(),
  createdAt: z.string(),
  conversationId: z.string(),
  reporter: z.object({ id: z.string(), displayName: z.string().nullable() }),
  reportedUser: z.object({ id: z.string(), displayName: z.string().nullable(), accountType: z.string() }),
  conversation: z.object({
    messages: z.array(z.object({
      id: z.string(),
      senderId: z.string(),
      type: z.string(),
      content: z.string().nullable(),
      attachmentData: z.unknown().nullable(),
      createdAt: z.string(),
      attachments: z.array(z.object({
        id: z.string(),
        originalName: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      })),
    })),
  }),
});

const reportsResponseSchema = z.object({ reports: z.array(reportSchema) });
const reviewResponseSchema = z.object({
  reportId: z.string(),
  status: z.enum(["INVESTIGATING", "DISMISSED", "ACTIONED"]),
});

type Report = z.infer<typeof reportSchema>;

const statusLabels = {
  OPEN: "statusOpen",
  INVESTIGATING: "statusInvestigating",
  DISMISSED: "statusDismissed",
  ACTIONED: "statusActioned",
} as const;

export function CommunicationReports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [since, setSince] = useState("");
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [nextStatuses, setNextStatuses] = useState<Record<string, "INVESTIGATING" | "DISMISSED" | "ACTIONED">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (reasonFilter) params.set("reason", reasonFilter);
    if (since) params.set("since", new Date(`${since}T00:00:00.000Z`).toISOString());
    const result = await requestApi(
      `/api/v1/admin/communication-reports?${params}`,
      reportsResponseSchema,
      t("auth.requestFailed"),
    );
    setReports(result.reports);
    setDecisions((current) => Object.fromEntries(
      result.reports.map((report) => [report.id, current[report.id] ?? report.decisionReason ?? ""]),
    ));
    setNextStatuses((current) => Object.fromEntries(
      result.reports.map((report) => [
        report.id,
        current[report.id] ?? (report.status === "OPEN" ? "INVESTIGATING" : report.status),
      ]),
    ));
  }, [reasonFilter, since, statusFilter, t]);
  useVisiblePolling(loadReports, 30_000);

  async function saveDecision(report: Report) {
    const decisionReason = decisions[report.id]?.trim();
    if (!decisionReason) {
      setErrors((current) => ({ ...current, [report.id]: t("communications.decisionReason") }));
      return;
    }
    try {
      const result = await requestApi(
        `/api/v1/admin/communication-reports/${report.id}`,
        reviewResponseSchema,
        t("auth.requestFailed"),
        {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatuses[report.id] ?? "INVESTIGATING",
            decisionReason,
          }),
        },
      );
      setReports((current) => current.map((item) =>
        item.id === report.id
          ? { ...item, status: result.status, decisionReason }
          : item,
      ));
      setErrors((current) => ({ ...current, [report.id]: "" }));
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        [report.id]: reason instanceof Error ? reason.message : t("auth.requestFailed"),
      }));
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-[#123b35]">{t("communications.reviewReports")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("communications.reportedConversation")}</p>
      </header>
      <div className="mb-5 grid gap-3 rounded-2xl border border-[#dce4e1] bg-white p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">
          {t("communications.reportStatus")}
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border px-3">
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{t(`communications.${label}`)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("communications.reportReason")}
          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} className="min-h-10 rounded-lg border px-3">
            <option value="">All reasons</option>
            {["SPAM", "HARASSMENT", "FRAUD", "IMPERSONATION", "INAPPROPRIATE_CONTENT", "OTHER"].map((reason) => <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Since
          <input type="date" value={since} onChange={(event) => setSince(event.target.value)} className="min-h-10 rounded-lg border px-3" />
        </label>
      </div>
      <div className="grid gap-4">
        {reports.map((report) => (
          <article key={report.id} className="rounded-2xl border border-[#dce4e1] bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-[#123b35]">{report.reason.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(report.createdAt).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-[#f5f8f6] px-3 py-1 text-xs font-semibold">{t(`communications.${statusLabels[report.status]}`)}</span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Reporter</dt><dd className="font-semibold">{report.reporter.displayName ?? report.reporter.id}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("communications.reportedAccount")}</dt><dd className="font-semibold">{report.reportedUser.displayName ?? report.reportedUser.id} · {report.reportedUser.accountType}</dd></div>
            </dl>
            {report.explanation && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{report.explanation}</p>}
            <details className="mt-4 rounded-xl border border-[#e1e9e5]">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#123b35]">{t("communications.reportedConversation")} ({report.conversation.messages.length})</summary>
              <div className="max-h-80 space-y-2 overflow-y-auto border-t border-[#e1e9e5] p-3">
                {report.conversation.messages.map((message) => (
                  <div key={message.id} className="rounded-lg bg-[#f8faf9] p-3">
                    <p className="text-[10px] text-slate-500">{message.senderId} · {new Date(message.createdAt).toLocaleString()}</p>
                    {message.content && <p className="mt-1 whitespace-pre-wrap text-sm">{message.content}</p>}
                    {message.attachments.map((file) => (
                      <p key={file.id} className="mt-1 text-xs text-slate-600">{file.originalName} · {file.mimeType}</p>
                    ))}
                  </div>
                ))}
              </div>
            </details>
            <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-semibold">
                {t("communications.reportStatus")}
                <select
                  value={nextStatuses[report.id] ?? "INVESTIGATING"}
                  onChange={(event) => setNextStatuses((current) => ({ ...current, [report.id]: event.target.value as "INVESTIGATING" | "DISMISSED" | "ACTIONED" }))}
                  className="min-h-10 rounded-lg border px-3 text-sm"
                >
                  {(["INVESTIGATING", "DISMISSED", "ACTIONED"] as const).map((status) => <option key={status} value={status}>{t(`communications.${statusLabels[status]}`)}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                {t("communications.decisionReason")}
                <input value={decisions[report.id] ?? ""} onChange={(event) => setDecisions((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={1000} className="min-h-10 rounded-lg border px-3 text-sm font-normal" />
              </label>
              <button type="button" onClick={() => void saveDecision(report)} className="self-end rounded-lg bg-[#123b35] px-4 py-2.5 text-sm font-bold text-white">{t("communications.saveDecision")}</button>
            </div>
            {errors[report.id] && <p role="alert" className="mt-2 text-sm text-red-700">{errors[report.id]}</p>}
          </article>
        ))}
        {reports.length === 0 && <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-600">{t("communications.noReports")}</p>}
      </div>
    </section>
  );
}
