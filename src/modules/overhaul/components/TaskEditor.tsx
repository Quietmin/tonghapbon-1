"use client";

import { useState } from "react";
import { Card, Icon, Button } from "@/shared/components/ui";
import type { OverhaulTask } from "../lib/repo";

/**
 * 작업항목 한 건을 손으로 고치거나 새로 넣는 폼.
 *
 * 파서가 항상 맞을 수는 없다. 수량·단위·분야가 어긋난 항목("확인 필요")을 여기서
 * 고치고, 엑셀에 없던 작업도 넣는다. 저장하면 "확인 필요" 표시는 떨어진다 —
 * 사람이 확인을 마쳤다는 뜻이다(서버가 처리한다).
 *
 * 계획 시작·종료일을 비워 두면 공정표가 작업명 키워드로 자동 배치한다.
 * 날짜를 넣으면 그 날짜가 자동 배치를 이긴다(schedule.ts의 1순위).
 */

export interface TaskDraft {
  name: string;
  spec: string;
  unit: string;
  plan_qty: string;
  field: string;
  equipment_type: string;
  tag: string;
  assignee: string;
  plan_start: string;
  plan_end: string;
}

export function draftFromTask(t: OverhaulTask): TaskDraft {
  return {
    name: t.name,
    spec: t.spec ?? "",
    unit: t.unit ?? "",
    plan_qty: String(t.plan_qty ?? 0),
    field: t.field ?? "",
    equipment_type: t.equipment_type ?? "",
    tag: t.tag ?? "",
    assignee: t.assignee ?? "",
    plan_start: t.plan_start ?? "",
    plan_end: t.plan_end ?? "",
  };
}

export const EMPTY_DRAFT: TaskDraft = {
  name: "",
  spec: "",
  unit: "EA",
  plan_qty: "0",
  field: "",
  equipment_type: "",
  tag: "",
  assignee: "",
  plan_start: "",
  plan_end: "",
};

/** 폼 값 → API가 받는 모양. 빈 문자열은 서버에서 NULL로 바뀐다 */
export function draftToPatch(d: TaskDraft) {
  return {
    name: d.name.trim(),
    spec: d.spec.trim(),
    unit: d.unit.trim() || "EA",
    plan_qty: Number(d.plan_qty) || 0,
    field: d.field,
    equipment_type: d.equipment_type.trim(),
    tag: d.tag.trim(),
    assignee: d.assignee.trim(),
    plan_start: d.plan_start,
    plan_end: d.plan_end,
    // 이 폼으로 저장했다는 건 사람이 값을 다 확인했다는 뜻이므로 "확인 필요"를 뗀다
    needs_review: false,
  };
}

const FIELDS = ["기계", "전기", "제어"];

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-on-surface-variant">{hint}</span>}
    </label>
  );
}

export default function TaskEditor({
  task,
  equipmentOptions,
  onSaved,
  onCancel,
  onDeleted,
}: {
  /** null이면 신규 추가 */
  task: OverhaulTask | null;
  equipmentOptions: string[];
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(task ? draftFromTask(task) : { ...EMPTY_DRAFT });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name.trim()) {
      setError("작업명을 입력하세요.");
      return;
    }
    if (draft.plan_start && draft.plan_end && draft.plan_end < draft.plan_start) {
      setError("종료일이 시작일보다 앞설 수 없습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch = draftToPatch(draft);
      const res = task
        ? await fetch("/api/overhaul/tasks", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: task.id, patch }),
          })
        : await fetch("/api/overhaul/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    if (
      !confirm(
        `"${task.name}" 작업을 지웁니다.\n\n이 작업에 입력한 실적 이력과 사진도 함께 삭제되고 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const json = await (
        await fetch(`/api/overhaul/tasks?id=${task.id}`, { method: "DELETE" })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-card-padding border border-primary/30" lift={false}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name={task ? "edit" : "add_circle"} className="text-base text-primary" />
          {task ? "작업항목 수정" : "작업항목 추가"}
        </h2>
        {task?.needs_review && (
          <span className="text-xs font-bold text-status-warning flex items-center gap-1">
            <Icon name="warning" className="text-sm" />
            확인이 필요한 항목입니다 — 저장하면 표시가 사라집니다
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Labeled label="작업명">
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Labeled>
        </div>
        <div className="sm:col-span-2">
          <Labeled label="규격">
            <input className="input" value={draft.spec} onChange={(e) => set({ spec: e.target.value })} />
          </Labeled>
        </div>

        <Labeled label="계획수량">
          <input
            type="number"
            min="0"
            step="any"
            className="input font-mono-data"
            value={draft.plan_qty}
            onChange={(e) => set({ plan_qty: e.target.value })}
          />
        </Labeled>
        <Labeled label="단위">
          <input className="input" value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
        </Labeled>
        <Labeled label="분야">
          <select
            className="input"
            value={draft.field}
            onChange={(e) => set({ field: e.target.value })}
          >
            <option value="">미분류</option>
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="설비">
          <input
            className="input"
            list="task-equipment-options"
            value={draft.equipment_type}
            onChange={(e) => set({ equipment_type: e.target.value })}
          />
          <datalist id="task-equipment-options">
            {equipmentOptions.map((eq) => (
              <option key={eq} value={eq} />
            ))}
          </datalist>
        </Labeled>

        <Labeled label="Tag No.">
          <input
            className="input font-mono-data"
            value={draft.tag}
            onChange={(e) => set({ tag: e.target.value })}
          />
        </Labeled>
        <Labeled label="담당자">
          <input
            className="input"
            value={draft.assignee}
            onChange={(e) => set({ assignee: e.target.value })}
          />
        </Labeled>
        <Labeled label="계획 시작일" hint="비우면 공정표가 자동 배치">
          <input
            type="date"
            className="input"
            value={draft.plan_start}
            onChange={(e) => set({ plan_start: e.target.value })}
          />
        </Labeled>
        <Labeled label="계획 종료일" hint="비우면 공정표가 자동 배치">
          <input
            type="date"
            className="input"
            value={draft.plan_end}
            onChange={(e) => set({ plan_end: e.target.value })}
          />
        </Labeled>
      </div>

      {error && (
        <p className="text-sm text-error flex items-center gap-2 mt-3">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <Button onClick={save} disabled={busy}>
          <Icon name="save" className="text-base" />
          {busy ? "저장 중…" : "저장"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        {task && (
          <Button variant="danger" className="ml-auto" onClick={remove} disabled={busy}>
            <Icon name="delete" className="text-base" />
            이 작업 삭제
          </Button>
        )}
      </div>
    </Card>
  );
}
