"use client";

import Link from "next/link";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/shared/components/ui";
import type { StatusIssueRow } from "../lib/repo";
import { StatusBadge, formatDate, formatDateTime } from "./badges";
import { FaultReportLink, IssuePhotos } from "./StatusPhotos";

/**
 * 현황 요약 창 — 보기 전용.
 *
 * 운영부는 조치 상태를 바꾸지 않고(그건 유지보수 담당자의 일) "내가 올린 이슈가 어떻게 되고 있는지"만
 * 확인하므로, 첫 화면의 현황 목록에서 행을 누르면 이 창이 뜬다. 유지보수 부서의 조치 갱신 창
 * (UpdateDialog)과 같은 자리·같은 모양이라 어느 부서에서든 목록 → 창의 흐름이 같다.
 *
 * body 로 포털한다 — 첫 화면 카드(backdrop-filter)처럼 변형이 걸린 조상 안에서 fixed 로 그리면
 * 창이 카드 안에 갇히고 뒤따르는 카드에 가려진다(UpdateDialog 주석 참고).
 */
export default function IssueDetailDialog({
  row,
  onClose,
  moreHref = "/status",
}: {
  row: StatusIssueRow;
  onClose: () => void;
  /** 창 아래의 "현황 조회에서 보기" 이동 경로 */
  moreHref?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasAction = Boolean(row.action_note || row.scheduled_date || row.handled_by);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issueDetailTitle"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface-container-lowest p-6 shadow-xl flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2">
              <StatusBadge status={row.status} />
            </div>
            <h3 id="issueDetailTitle" className="text-title-sm text-on-surface break-keep">
              {row.equipment_name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="text-sm text-on-surface whitespace-pre-wrap break-keep">{row.content}</p>
        <p className="text-xs text-on-surface-variant">
          {[row.branch, row.department, `작성 ${row.reporter}`, formatDateTime(row.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <IssuePhotos issueId={row.id} />

        <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
          <h4 className="text-sm font-bold text-on-surface">조치 현황</h4>
          {hasAction ? (
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
              {row.action_note && (
                <>
                  <dt className="text-on-surface-variant">조치 내용</dt>
                  <dd className="text-on-surface whitespace-pre-wrap break-keep">{row.action_note}</dd>
                </>
              )}
              {row.scheduled_date && (
                <>
                  <dt className="text-on-surface-variant">조치 예정일</dt>
                  <dd className="text-on-surface">{formatDate(row.scheduled_date)}</dd>
                </>
              )}
              {row.handled_by && (
                <>
                  <dt className="text-on-surface-variant">조치자</dt>
                  <dd className="text-on-surface">{row.handled_by}</dd>
                </>
              )}
              {row.status_updated_at && (
                <>
                  <dt className="text-on-surface-variant">상태 변경</dt>
                  <dd className="text-on-surface">{formatDateTime(row.status_updated_at)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-on-surface-variant">
              아직 유지보수 담당자가 남긴 조치 내용이 없습니다.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <FaultReportLink row={row} />
          <Link
            href={moreHref}
            className="px-4 py-2.5 rounded-sm font-bold text-sm text-primary hover:bg-surface-container-high"
          >
            현황 조회에서 보기
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-sm font-bold text-sm bg-primary text-on-primary hover:opacity-90"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
