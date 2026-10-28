"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/shared/components/ui";
import type { StatusIssueRow } from "@/modules/status/lib/repo";
import { UpdateDialog } from "@/modules/status/components/StatusBoard";
import IssueDetailDialog from "@/modules/status/components/IssueDetailDialog";
import { StatusBadge, formatDate, formatDateTime } from "@/modules/status/components/badges";

/**
 * 첫 화면의 현황 목록 카드.
 *
 * editable 이면(유지보수 부서) 행을 눌러 조치 갱신 창을 바로 열고, 저장하면 서버 데이터를
 * 다시 읽어 건수·목록이 함께 바뀐다. 아니면(운영부) 같은 자리에 현황 요약 창(보기 전용)이 뜬다 —
 * 조치 상태는 유지보수 담당자가 바꾸는 것이라 운영 화면에서는 보기만 한다.
 */
export default function IssueListPanel({
  title,
  rows,
  emptyText,
  moreHref = "/status",
  moreLabel = "전체 보기",
  editable = false,
  /** 예정일을 오른쪽에 크게 보인다(추후 조치 예정 일정) */
  showSchedule = false,
  /** 담당부서를 함께 보인다(운영부는 어느 부서 몫인지 궁금하다) */
  showDepartment = false,
  /** 현황 조회처럼 항목별 칸(조치 상태·설비명·이슈 내용·담당부서·작성자·등록)이 있는 표로 보인다 */
  table = false,
  className = "",
}: {
  title: string;
  rows: StatusIssueRow[];
  emptyText: string;
  moreHref?: string;
  moreLabel?: string;
  editable?: boolean;
  showSchedule?: boolean;
  showDepartment?: boolean;
  table?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<StatusIssueRow | null>(null);
  /** 보기 전용 요약 창(운영부) */
  const [detail, setDetail] = useState<StatusIssueRow | null>(null);

  const rowBody = (r: StatusIssueRow) => (
    <>
      <StatusBadge status={r.status} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-on-surface truncate">{r.equipment_name}</span>
        <span className="block text-xs text-on-surface-variant truncate">
          {r.content}
        </span>
        <span className="block text-xs text-on-surface-variant mt-0.5 truncate">
          {[showDepartment ? r.department : null, r.reporter, formatDateTime(r.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {showSchedule && (
        <span className="shrink-0 text-sm font-bold text-status-info tabular-nums">
          {r.scheduled_date ? formatDate(r.scheduled_date) : "미정"}
        </span>
      )}
    </>
  );

  return (
    <Card lift={false} className={`p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-title-sm text-on-surface">{title}</h2>
        <Link href={moreHref} className="text-sm font-bold text-primary hover:underline">
          {moreLabel}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">{emptyText}</p>
      ) : table ? (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[130px]" />
              <col className="w-[170px]" />
              <col />
              <col className="w-[96px]" />
              <col className="w-[96px]" />
              <col className="w-[110px]" />
            </colgroup>
            <thead>
              <tr className="text-on-surface-variant border-b border-border-subtle">
                <th className="py-2.5 pl-1 pr-3 font-bold whitespace-nowrap text-center">조치 상태</th>
                <th className="py-2.5 pr-3 font-bold text-center">설비명</th>
                <th className="py-2.5 pr-3 font-bold text-center">이슈 내용</th>
                <th className="py-2.5 pr-3 font-bold whitespace-nowrap text-center">담당부서</th>
                <th className="py-2.5 pr-3 font-bold whitespace-nowrap text-center">작성자</th>
                <th className="py-2.5 pr-1 font-bold whitespace-nowrap text-center">등록</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => (editable ? setSelected(r) : setDetail(r))}
                  className="border-b border-border-subtle last:border-0 text-on-surface cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                >
                  <td className="py-3 pl-1 pr-3 align-top whitespace-nowrap text-center">
                    <StatusBadge status={r.status} />
                    {r.scheduled_date && (
                      <span className="block text-xs text-on-surface-variant mt-1">
                        예정 {formatDate(r.scheduled_date)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-top font-bold text-center">
                    <span className="line-clamp-2 break-keep">{r.equipment_name}</span>
                  </td>
                  <td className="py-3 pr-3 align-top text-center">
                    <span className="line-clamp-2 break-keep">{r.content}</span>
                  </td>
                  <td className="py-3 pr-3 align-top whitespace-nowrap text-center">{r.department}</td>
                  <td className="py-3 pr-3 align-top whitespace-nowrap text-center">{r.reporter}</td>
                  <td className="py-3 pr-1 align-top whitespace-nowrap text-on-surface-variant text-center">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-border-subtle last:border-0">
              <button
                type="button"
                onClick={() => (editable ? setSelected(r) : setDetail(r))}
                className="w-full flex items-start gap-3 py-3 text-left hover:bg-surface-container-high/60 transition-colors"
              >
                {rowBody(r)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && <IssueDetailDialog row={detail} onClose={() => setDetail(null)} moreHref={moreHref} />}

      {selected && (
        <UpdateDialog
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
