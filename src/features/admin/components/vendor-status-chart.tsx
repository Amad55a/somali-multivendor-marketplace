"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "@/i18n/hooks/use-translation";

type StatusBreakdown = {
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
};

const colors = ["#94a3b8", "#f4b942", "#123b35", "#b45309", "#6b7280"];

export function VendorStatusChart({
  statusBreakdown,
}: Readonly<{ statusBreakdown: StatusBreakdown }>) {
  const { t } = useTranslation();
  const data = [
    { name: t("admin.overview.statusDraft"), value: statusBreakdown.draft },
    { name: t("admin.overview.statusPending"), value: statusBreakdown.pending },
    { name: t("admin.overview.statusApproved"), value: statusBreakdown.approved },
    { name: t("admin.overview.statusRejected"), value: statusBreakdown.rejected },
    {
      name: t("admin.overview.statusChangesRequested"),
      value: statusBreakdown.changesRequested,
    },
  ].filter((entry) => entry.value > 0);

  return (
    <section className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-[#123b35]">
        {t("admin.overview.statusBreakdown")}
      </h3>
      {data.length === 0 ? (
        <p className="mt-8 text-sm text-slate-600">{t("admin.overview.noStatusData")}</p>
      ) : (
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} innerRadius={48} paddingAngle={3}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        {data.map((entry, index) => (
          <span key={entry.name} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            {entry.name}: {entry.value}
          </span>
        ))}
      </div>
    </section>
  );
}
