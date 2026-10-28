"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/shared/components/ui";
import { EntryPanel } from "./PerformanceEntry";

/**
 * 실적 입력 팝업 — 작업·공정의 작업 목록(과 공정표)에서 작업을 누르면 뜬다.
 *
 * 예전에는 행을 누르면 실적 입력 화면으로 넘어가 두 화면이 겹쳤다. 이제 목록을 벗어나지 않고
 * 그 자리에서 실적을 적고, 닫으면 목록(진행률은 새로 읽음)으로 바로 돌아온다. 내용은 실적 입력
 * 화면과 같은 EntryPanel 이다.
 *
 * body 로 포털한다 — 카드(backdrop-filter) 안에서 fixed 로 그리면 창이 카드에 갇히고 가려진다.
 */
export default function EntryDialog({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  /** 저장·삭제로 진행률이 바뀐 뒤 — 목록이 다시 읽는 데 쓴다 */
  onChanged?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // 창 뒤 화면이 같이 스크롤되지 않게 한다
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="실적 입력"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface p-4 sm:p-6 shadow-xl flex flex-col gap-gutter"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-title-sm text-on-surface flex items-center gap-2">
            <Icon name="edit_note" className="text-primary" /> 실적 입력
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <Icon name="close" />
          </button>
        </div>
        <EntryPanel key={taskId} taskId={taskId} onChanged={onChanged} />
      </div>
    </div>,
    document.body,
  );
}
