"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Icon } from "@/shared/components/ui";
import {
  CLICKABLE_ROW,
  HEAD_ROW,
  TABLE,
  TD_Y,
  TH_Y,
  rowKeyHandler,
} from "@/shared/lib/tableStyle";
import type { StatusIssueRow } from "@/modules/status/lib/repo";
import { UpdateDialog } from "@/modules/status/components/StatusBoard";
import IssueDetailDialog from "@/modules/status/components/IssueDetailDialog";
import { StatusBadge, formatDate, formatDateTime } from "@/modules/status/components/badges";

/** 표에 넣을 수 있는 열 — 화면마다 필요한 열만 골라 쓴다 */
export type IssueColumn =
  | "status"
  | "equipment"
  | "content"
  | "department"
  | "reporter"
  | "created"
  | "scheduled";

const ALL_COLUMNS: IssueColumn[] = ["status", "equipment", "content", "department", "reporter", "created"];

/** 열 이름·폭. content 는 폭을 안 주어 남는 자리를 다 쓴다 */
const COLUMN_META: Record<IssueColumn, { label: string; width?: string }> = {
  status: { label: "조치 상태", width: "130px" },
  equipment: { label: "설비명", width: "170px" },
  content: { label: "이슈 내용" },
  department: { label: "담당부서", width: "96px" },
  reporter: { label: "작성자", width: "96px" },
  created: { label: "등록", width: "110px" },
  scheduled: { label: "조치 예정일", width: "110px" },
};

/** 표 아래 페이지 번호 — 현재 페이지 둘레 5개까지만 보이고 양옆에 이전·다음 화살표가 있다 */
function Pagination({
  current,
  pageCount,
  onChange,
}: {
  current: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const WINDOW = 5;
  let start = Math.max(1, current - Math.floor(WINDOW / 2));
  const end = Math.min(pageCount, start + WINDOW - 1);
  start = Math.max(1, end - WINDOW + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btn =
    "min-w-9 h-9 px-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <nav className="flex items-center justify-center gap-1 pt-4" aria-label="페이지 이동">
      <button
        type="button"
        onClick={() => onChange(current - 1)}
        disabled={current <= 1}
        aria-label="이전 페이지"
        className={`${btn} text-on-surface-variant hover:bg-surface-container-high`}
      >
        <Icon name="chevron_left" className="text-lg" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-label={`${p}페이지`}
          aria-current={p === current ? "page" : undefined}
          className={`${btn} ${
            p === current
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(current + 1)}
        disabled={current >= pageCount}
        aria-label="다음 페이지"
        className={`${btn} text-on-surface-variant hover:bg-surface-container-high`}
      >
        <Icon name="chevron_right" className="text-lg" />
      </button>
    </nav>
  );
}

/**
 * 열이 3개 이하인 좁은 카드(좌우 두 단)에서는 상태·설비명 폭을 줄여 이슈 내용이 남는 자리를
 * 더 쓰게 한다. 폭을 그대로 두면 내용 칸이 너무 좁아 글이 잘린다.
 */
const COMPACT_WIDTH: Partial<Record<IssueColumn, string>> = {
  status: "112px",
  equipment: "128px",
};

/**
 * 첫 화면의 현황 목록 카드 — 현황 조회와 같은 모양의 표(모든 칸 가운데 정렬).
 *
 * editable 이면(유지보수 부서) 행을 눌러 조치 갱신 창을 바로 열고, 저장하면 서버 데이터를
 * 다시 읽어 건수·목록이 함께 바뀐다. 아니면(운영부) 같은 자리에 현황 요약 창(보기 전용)이 뜬다 —
 * 조치 상태는 유지보수 담당자가 바꾸는 것이라 운영 화면에서는 보기만 한다.
 * 행은 키보드(Tab → Enter·Space)로도 열 수 있다.
 */
export default function IssueListPanel({
  title,
  rows,
  emptyText,
  moreHref = "/status",
  moreLabel = "전체 보기",
  editable = false,
  columns = ALL_COLUMNS,
  pageSize,
  className = "",
}: {
  title: string;
  rows: StatusIssueRow[];
  emptyText: string;
  moreHref?: string;
  moreLabel?: string;
  editable?: boolean;
  columns?: IssueColumn[];
  /** 주면 이 건수씩 끊어 보여 주고 표 아래에 페이지 번호를 둔다(1 2 3 …) */
  pageSize?: number;
  className?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<StatusIssueRow | null>(null);
  /** 보기 전용 요약 창(운영부) */
  const [detail, setDetail] = useState<StatusIssueRow | null>(null);

  const hasScheduleColumn = columns.includes("scheduled");
  const compact = columns.length <= 3;
  const widthOf = (c: IssueColumn) => (compact ? COMPACT_WIDTH[c] : undefined) ?? COLUMN_META[c].width;

  // 페이지 나누기 — 저장 뒤 목록이 줄어 현재 페이지가 사라져도 마지막 페이지로 붙는다
  const [page, setPage] = useState(1);
  const pageCount = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const current = Math.min(page, pageCount);
  const visibleRows = pageSize ? rows.slice((current - 1) * pageSize, current * pageSize) : rows;

  function cell(col: IssueColumn, r: StatusIssueRow): React.ReactNode {
    switch (col) {
      case "status":
        return (
          <>
            <StatusBadge status={r.status} />
            {/* 예정일 열이 따로 없을 때만 상태 아래에 붙인다 */}
            {!hasScheduleColumn && r.scheduled_date && (
              <span className="block text-xs text-on-surface-variant mt-1">
                예정 {formatDate(r.scheduled_date)}
              </span>
            )}
          </>
        );
      case "equipment":
        return <span className="line-clamp-2 break-keep font-bold">{r.equipment_name}</span>;
      case "content":
        return <span className="line-clamp-2 break-keep">{r.content}</span>;
      case "department":
        return r.department;
      case "reporter":
        return r.reporter;
      case "created":
        return <span className="text-on-surface-variant">{formatDateTime(r.created_at)}</span>;
      case "scheduled":
        return (
          <span className="font-bold text-status-info tabular-nums">
            {r.scheduled_date ? formatDate(r.scheduled_date) : "미정"}
          </span>
        );
    }
  }

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
      ) : (
        <>
        {/* 폰(md 미만) — 표는 칸이 좁아 이슈 내용이 잘리므로 카드 목록으로 보인다. 누르기·키보드는 표와 같다 */}
        <ul className="md:hidden flex flex-col divide-y divide-border-subtle">
          {visibleRows.map((r) => {
            const open = () => (editable ? setSelected(r) : setDetail(r));
            const meta = columns
              .filter((c) => c === "department" || c === "reporter" || c === "created")
              .map((c) => cell(c, r))
              .filter(Boolean);
            return (
              <li
                key={r.id}
                tabIndex={0}
                role="button"
                onClick={open}
                onKeyDown={rowKeyHandler(open)}
                className="py-3 px-1 flex flex-col gap-1.5 cursor-pointer active:bg-surface-container-low focus-visible:bg-surface-container-low outline-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {columns.includes("status") && (
                    <span className="shrink-0">
                      <StatusBadge status={r.status} />
                    </span>
                  )}
                  <span className="font-bold text-on-surface text-sm truncate">{r.equipment_name}</span>
                  {hasScheduleColumn && r.scheduled_date && (
                    <span className="ml-auto shrink-0 text-xs font-bold text-status-info tabular-nums">
                      {formatDate(r.scheduled_date)}
                    </span>
                  )}
                </div>
                {columns.includes("content") && (
                  <p className="text-sm text-on-surface line-clamp-2 break-keep">{r.content}</p>
                )}
                {!hasScheduleColumn && r.scheduled_date && (
                  <p className="text-xs text-on-surface-variant">예정 {formatDate(r.scheduled_date)}</p>
                )}
                {meta.length > 0 && (
                  <p className="text-xs text-on-surface-variant flex flex-wrap gap-x-2">
                    {meta.map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="max-md:hidden overflow-x-auto -mx-1">
          <table className={`${TABLE} table-fixed`}>
            <colgroup>
              {columns.map((c) => (
                <col key={c} style={widthOf(c) ? { width: widthOf(c) } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr className={HEAD_ROW}>
                {columns.map((c) => (
                  <th key={c} className={`${TH_Y} px-3 text-center`}>
                    {COLUMN_META[c].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const open = () => (editable ? setSelected(r) : setDetail(r));
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={rowKeyHandler(open)}
                    className={CLICKABLE_ROW}
                  >
                    {columns.map((c) => (
                      <td key={c} className={`${TD_Y} px-3 align-top text-center`}>
                        {cell(c, r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {pageCount > 1 && (
        <Pagination current={current} pageCount={pageCount} onChange={setPage} />
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
