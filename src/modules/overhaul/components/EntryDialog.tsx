"use client";

import Dialog, { DialogHeader } from "@/shared/components/Dialog";
import { EntryPanel } from "./PerformanceEntry";

/**
 * 실적 입력 팝업 — 작업·공정의 작업 목록(과 공정표)에서 작업을 누르면 뜬다.
 *
 * 예전에는 행을 누르면 실적 입력 화면으로 넘어가 두 화면이 겹쳤다. 이제 목록을 벗어나지 않고 그 자리에서
 * 실적을 적고, 닫으면 목록(진행률은 새로 읽음)으로 바로 돌아온다. 내용은 EntryPanel 이고, 팝업 틀은
 * 공통 Dialog 다(Esc·스크롤 잠금·포커스·폰 시트).
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
  return (
    <Dialog
      onClose={onClose}
      labelledBy="entryDlgTitle"
      size="xl"
      tone="page"
      className="p-4 sm:p-6 flex flex-col gap-gutter"
    >
      <DialogHeader id="entryDlgTitle" title="실적 입력" onClose={onClose} />
      <EntryPanel key={taskId} taskId={taskId} onChanged={onChanged} />
    </Dialog>
  );
}
