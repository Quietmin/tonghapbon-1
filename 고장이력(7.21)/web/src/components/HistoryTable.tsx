"use client";

import { useRouter } from "next/navigation";
import type { FailureHistoryRow } from "@/lib/db";
import { formatDatetimeDisplay } from "@/lib/datetime";

function statusClass(status: string | null): string {
  return status === "조치완료" ? "bg-green-100 text-status-success" : "bg-red-100 text-status-critical";
}

export default function HistoryTable({
  rows,
  emptyMessage = "등록된 고장이력이 없습니다. 우측 상단의 '신규 등록'으로 첫 이력을 등록해보세요.",
}: {
  rows: FailureHistoryRow[];
  emptyMessage?: string;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return <div className="p-12 text-center text-on-surface-variant">{emptyMessage}</div>;
  }

  return (
    <table className="w-full text-left border-collapse">
      <thead className="bg-table-header border-b border-border-subtle">
        <tr>
          <th className="px-6 py-4 text-label-caps text-secondary font-bold">발생일시</th>
          <th className="px-6 py-4 text-label-caps text-secondary font-bold">지사</th>
          <th className="px-6 py-4 text-label-caps text-secondary font-bold">설비명</th>
          <th className="px-6 py-4 text-label-caps text-secondary font-bold">고장제목</th>
          <th className="px-6 py-4 text-label-caps text-secondary font-bold">상태</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle text-body-md">
        {rows.map((row) => (
          <tr
            key={row.id}
            onDoubleClick={() => router.push(`/history/${row.id}`)}
            title="더블클릭하여 상세보기"
            className="hover:bg-slate-50 cursor-pointer transition-colors select-none"
          >
            <td className="px-6 py-4 font-data-mono text-secondary">{formatDatetimeDisplay(row.occurred_at)}</td>
            <td className="px-6 py-4">{row.branch || "-"}</td>
            <td className="px-6 py-4 font-bold">{[row.equipment_name, row.device_name].filter(Boolean).join(" / ") || "-"}</td>
            <td className="px-6 py-4 truncate max-w-[200px]">{row.title || "-"}</td>
            <td className="px-6 py-4">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(row.status)}`}>
                {row.status || "-"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
