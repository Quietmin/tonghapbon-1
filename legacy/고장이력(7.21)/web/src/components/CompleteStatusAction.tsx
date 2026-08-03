"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nowAsDatetimeLocalValue } from "@/lib/datetime";

export default function CompleteStatusAction({ failureId }: { failureId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(nowAsDatetimeLocalValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-status-success text-white font-bold hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[20px]">task_alt</span>
        조치완료로 변경
      </button>
    );
  }

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/failure-history/${failureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "조치완료", recoveredAt: date }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "처리 중 오류가 발생했습니다.");
        setSaving(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 bg-white border border-border-subtle rounded-lg p-2">
        <span className="text-body-sm text-on-surface-variant pl-2">조치완료 일시</span>
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border-border-subtle text-body-sm"
        />
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-status-success text-white font-bold text-body-sm disabled:opacity-60"
        >
          {saving ? "처리 중..." : "확인"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-outline text-on-surface font-bold text-body-sm"
        >
          취소
        </button>
      </div>
      {error && <span className="text-status-critical text-xs">{error}</span>}
    </div>
  );
}
