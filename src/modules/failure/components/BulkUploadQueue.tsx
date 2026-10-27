"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Button, Icon } from "@/shared/components/ui";
import FailureHistoryForm from "./FailureHistoryForm";
import type { AttachmentInput, FailureHistoryInput } from "@/modules/failure/lib/repo";

type Status = "pending" | "processing" | "extracted" | "failed" | "saved";

interface QueueItem {
  id: string;
  file: File;
  status: Status;
  fields?: Partial<FailureHistoryInput>;
  attachment?: AttachmentInput;
  warning?: string;
  error?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "대기",
  processing: "처리 중…",
  extracted: "추출 완료",
  failed: "실패",
  saved: "등록됨",
};

const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-surface-container-high text-on-surface-variant",
  processing: "bg-status-info/10 text-status-info",
  extracted: "bg-status-warning/10 text-status-warning",
  failed: "bg-status-error/10 text-status-error",
  saved: "bg-status-success/10 text-status-success",
};

let seq = 0;
const nextId = () => `q${(seq += 1)}`;

/**
 * 여러 PDF를 한꺼번에 올려 하나씩 순서대로 추출한다(서버에 동시에 여러 요청을
 * 안 보내려고 순차 처리). 추출이 끝난 파일은 모달로 검토한다 — 등록을 마치면
 * 자동으로 다음 추출 완료 파일의 검토 모달이 열린다("다음 고장으로 넘어간다").
 * 목록 자체는 늘 그대로 보이고, 검토 중에도 다른 항목이 화면 밖으로 밀려나지
 * 않는다(예전엔 목록 안에 폼을 펼쳐서 다음 항목이 아래로 밀려 안 보였다).
 *
 * itemsRef를 유일한 진실의 소스로 둔다 — setState 업데이터 콜백으로 "지금 막
 * 추가한 항목"을 되읽는 식은 배치·타이밍에 따라 깨지기 쉽다. 처리 루프는
 * itemsRef를 직접 보고 진행하고, 화면은 그 스냅샷을 상태로만 반영한다.
 */
export default function BulkUploadQueue() {
  const itemsRef = useRef<QueueItem[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  // 취소로 닫은 항목은 자동으로 다시 열지 않는다 — "검토" 버튼으로 직접 열 수는 있다.
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  function sync() {
    setItems([...itemsRef.current]);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    itemsRef.current = itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it));
    sync();
  }

  function addFiles(files: FileList | File[]) {
    const pdfFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) return;
    const newItems: QueueItem[] = pdfFiles.map((file) => ({ id: nextId(), file, status: "pending" }));
    itemsRef.current = [...itemsRef.current, ...newItems];
    sync();
    void runQueue();
  }

  /** 대기 중인 파일을 하나씩 순서대로 처리한다. 이미 돌고 있으면 새로 시작하지 않는다 —
   * addFiles가 여러 번 불려도(파일을 나눠서 올려도) 루프 하나가 계속 이어서 처리한다. */
  async function runQueue() {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      let target = itemsRef.current.find((it) => it.status === "pending");
      while (target) {
        updateItem(target.id, { status: "processing" });

        try {
          const body = new FormData();
          body.append("file", target.file);
          const res = await fetch("/api/failure/extract", { method: "POST", body });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "처리에 실패했습니다.");
          updateItem(target.id, {
            status: "extracted",
            fields: data.fields,
            attachment: data.attachment,
            warning: data.warning,
          });
        } catch (e) {
          updateItem(target.id, {
            status: "failed",
            error: e instanceof Error ? e.message : "처리에 실패했습니다.",
          });
        }

        target = itemsRef.current.find((it) => it.status === "pending");
      }
    } finally {
      processingRef.current = false;
    }
  }

  // 검토 모달이 닫혀 있고 검토를 기다리는(추출 완료) 항목이 있으면 자동으로 연다.
  // 하나 등록(saved)하거나 취소하면 이 effect가 곧바로 다음 것을 열어준다.
  useEffect(() => {
    if (activeReviewId) return;
    const next = items.find((it) => it.status === "extracted" && !skippedIds.has(it.id));
    if (next) setActiveReviewId(next.id);
  }, [items, activeReviewId, skippedIds]);

  const activeItem = items.find((it) => it.id === activeReviewId) ?? null;

  /** 등록 없이 닫기 — 다시 자동으로 안 열리게 건너뜀 목록에 넣는다 */
  function dismissReview(id: string) {
    setSkippedIds((prev) => new Set(prev).add(id));
    setActiveReviewId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        lift={false}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`p-6 flex flex-col items-center gap-2 text-center cursor-pointer border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border-subtle"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Icon name="upload_file" className="text-3xl text-on-surface-variant" />
        <p className="text-sm font-bold text-on-surface">고장상보 PDF 여러 개를 한꺼번에 끌어놓거나 클릭해서 선택하세요</p>
        <p className="text-xs text-on-surface-variant">
          한 번에 여러 개를 올려도 서버에는 순서대로 하나씩 보냅니다. 추출이 끝나는 대로 검토 창이 자동으로 열립니다.
        </p>
      </Card>

      {items.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-8">아직 올린 파일이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={item.id} lift={false} className="p-4 flex items-center gap-3">
              <Icon name="picture_as_pdf" className="text-xl text-on-surface-variant shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-surface truncate">{item.file.name}</p>
                {item.status === "extracted" && (
                  <p className="text-xs text-on-surface-variant truncate">
                    {item.fields?.equipmentName || item.fields?.title || "제목/설비명 미추출"}
                    {item.fields?.occurredAt ? ` · ${item.fields.occurredAt}` : ""}
                  </p>
                )}
                {item.status === "failed" && <p className="text-xs text-status-error truncate">{item.error}</p>}
                {item.status === "extracted" && item.warning && (
                  <p className="text-xs text-status-warning truncate">{item.warning}</p>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${STATUS_CLASS[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
              {item.status === "extracted" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSkippedIds((prev) => {
                      if (!prev.has(item.id)) return prev;
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                    setActiveReviewId(item.id);
                  }}
                >
                  검토
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {activeItem && (
        <div
          className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4"
          onClick={() => dismissReview(activeItem.id)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-title-sm font-bold text-on-surface truncate">{activeItem.file.name} 검토</h2>
              <button
                type="button"
                onClick={() => dismissReview(activeItem.id)}
                aria-label="닫기"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" className="text-base" />
              </button>
            </div>
            <FailureHistoryForm
              key={activeItem.id}
              initialForm={activeItem.fields}
              initialAttachment={activeItem.attachment ?? null}
              showDropzone={false}
              onSaved={() => {
                updateItem(activeItem.id, { status: "saved" });
                setActiveReviewId(null);
              }}
              onCancel={() => dismissReview(activeItem.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
