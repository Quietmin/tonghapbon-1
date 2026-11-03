"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Icon, LoadingState } from "@/shared/components/ui";
import { EQUIPMENT_FIELDS, EQUIPMENT_TYPES } from "@/shared/lib/equipmentMeta";
import type { Device } from "@/shared/lib/equipment";

/**
 * 설비 마스터의 입력 부품들 — 설비 폼과 기기·태그 패널.
 *
 * 표 자체는 LongTermPlan.tsx 하나뿐이다. 예전에는 "장기 유지보수 계획" 표와
 * "설비 목록" 표가 같은 설비를 두 번 나열했는데, 행 펼침이 생기면서 완전히
 * 겹쳐 보여 하나로 합쳤다 (계획·이력·기기가 설비 한 줄에 모인다).
 * 그래서 여기에는 그 표가 불러 쓰는 폼·패널만 남는다.
 */

// ---------------------------------------------------------------------------
// 설비 폼 — 추가("new")와 수정(기존 행)을 한 컴포넌트로 처리한다
// ---------------------------------------------------------------------------

export interface EquipmentFormTarget {
  id: string;
  name: string;
  type: string | null;
  field: string | null;
  note: string | null;
}

interface EquipForm {
  name: string;
  type: string;
  field: string;
  note: string;
}

const BLANK_EQUIP: EquipForm = { name: "", type: "", field: "", note: "" };

export function EquipmentForm({
  target,
  onDone,
  onCancel,
}: {
  target: EquipmentFormTarget | "new";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EquipForm>(
    target === "new"
      ? BLANK_EQUIP
      : {
          name: target.name,
          type: target.type ?? "",
          field: target.field ?? "",
          note: target.note ?? "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type || null,
        field: form.field || null,
        note: form.note.trim() || null,
      };
      const json = await (
        await fetch("/api/equipment", {
          method: target === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(target === "new" ? body : { id: target.id, patch: body }),
        })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const label = "text-label-caps uppercase text-on-surface-variant";

  return (
    <Card lift={false} className="p-card-padding">
      <h2 className="text-title-sm text-on-surface flex items-center gap-2">
        <Icon name={target === "new" ? "add_circle" : "edit"} className="text-base text-primary" />
        {target === "new" ? "설비 추가" : "설비 정보 수정"}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="col-span-2 md:col-span-1">
          <p className={label}>설비명</p>
          <input aria-label="예: 1호기 HRSG"
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: 1호기 HRSG"
          />
        </div>
        <div>
          <p className={label}>유형</p>
          <select aria-label="유형"
            className="input mt-1"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="">선택 안 함</option>
            {EQUIPMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className={label}>분야</p>
          <select aria-label="분야"
            className="input mt-1"
            value={form.field}
            onChange={(e) => setForm({ ...form, field: e.target.value })}
          >
            <option value="">선택 안 함</option>
            {EQUIPMENT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-4">
          <p className={label}>비고</p>
          <input aria-label="메모 (선택)"
            className="input mt-1"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="메모 (선택)"
          />
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-error flex items-center gap-1.5">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 기기·태그 폼
// ---------------------------------------------------------------------------

interface DeviceForm {
  tag: string;
  name: string;
  spec: string;
}

const BLANK_DEVICE: DeviceForm = { tag: "", name: "", spec: "" };

function DeviceFormCard({
  equipmentId,
  target,
  onDone,
  onCancel,
}: {
  equipmentId: string;
  target: Device | "new";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DeviceForm>(
    target === "new"
      ? BLANK_DEVICE
      : { tag: target.tag, name: target.name ?? "", spec: target.spec ?? "" },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        tag: form.tag.trim(),
        name: form.name.trim() || null,
        spec: form.spec.trim() || null,
      };
      const json = await (
        await fetch("/api/equipment/device", {
          method: target === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            target === "new" ? { equipmentId, ...body } : { id: target.id, patch: body },
          ),
        })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const label = "text-label-caps uppercase text-on-surface-variant";

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-4 mt-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <p className={label}>태그</p>
          <input aria-label="예: PIT-7610"
            className="input mt-1"
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value })}
            placeholder="예: PIT-7610"
          />
        </div>
        <div>
          <p className={label}>기기명</p>
          <input aria-label="예: 압력계 (선택)"
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: 압력계 (선택)"
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <p className={label}>규격</p>
          <input aria-label="규격 (선택)"
            className="input mt-1"
            value={form.spec}
            onChange={(e) => setForm({ ...form, spec: e.target.value })}
            placeholder="(선택)"
          />
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-error flex items-center gap-1.5">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button onClick={() => void save()} disabled={saving || !form.tag.trim()}>
          {saving ? "저장 중…" : target === "new" ? "기기 추가" : "저장"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 기기·태그 패널 — 설비 행을 펼쳤을 때 보수계획 항목 아래에 붙는다
// ---------------------------------------------------------------------------

export function DevicePanel({
  equipmentId,
  equipmentName,
  onChanged,
}: {
  equipmentId: string;
  equipmentName: string;
  /** 기기 수가 바뀌면 바깥 표의 "기기" 칸도 다시 읽어야 한다 */
  onChanged?: () => void;
}) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [editing, setEditing] = useState<Device | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await (
        await fetch(`/api/equipment/device?equipmentId=${equipmentId}`)
      ).json();
      if (json.ok) setDevices(json.items);
      else setError(json.error ?? "기기 목록을 불러오지 못했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDevices([]);
    }
  }, [equipmentId]);

  useEffect(() => {
    setDevices(null);
    setEditing(null);
    void load();
  }, [load]);

  const remove = async (d: Device) => {
    if (!confirm(`태그 "${d.tag}"를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const json = await (
        await fetch(`/api/equipment/device?id=${d.id}`, { method: "DELETE" })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      if (editing !== "new" && editing?.id === d.id) setEditing(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const th = "py-2 px-2 text-on-surface-variant text-xs font-semibold whitespace-nowrap";

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
          <Icon name="sell" className="text-base text-primary" />
          기기·태그 — {equipmentName}
        </h3>
        <Button variant="ghost" onClick={() => setEditing("new")} disabled={editing === "new"}>
          <Icon name="add" className="text-base" />
          기기 추가
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-error flex items-center gap-1.5">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}

      {editing && (
        <DeviceFormCard
          equipmentId={equipmentId}
          target={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void load();
            onChanged?.();
          }}
        />
      )}

      {!devices ? (
        <LoadingState rows={2} />
      ) : devices.length === 0 ? (
        <EmptyState
          icon="sell"
          title="등록된 기기·태그가 없습니다"
          desc="태그(예: PIT-7610)를 등록하면 챗봇의 태그 정확일치 검색 대상이 됩니다. 보수계획 엑셀에 태그번호가 있으면 업로드 때 자동으로 등록됩니다."
        />
      ) : (
        <div className="overflow-x-auto mt-2 rounded-xl border border-border-subtle bg-surface-container-lowest">
          <table className="w-full text-left min-w-[520px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className={th}>태그</th>
                <th className={th}>기기명</th>
                <th className={th}>규격</th>
                <th className={`${th} text-right`}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="py-2 px-2 text-[13px] font-bold font-mono-data text-on-surface">
                    {d.tag}
                  </td>
                  <td className="py-2 px-2 text-[13px] text-on-surface">{d.name ?? "—"}</td>
                  <td className="py-2 px-2 text-[13px] text-on-surface-variant">{d.spec ?? "—"}</td>
                  <td className="py-2 px-2">
                    <span className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="수정"
                        disabled={busy}
                        onClick={() => setEditing(d)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary-container/30 transition-colors"
                      >
                        <Icon name="edit" className="text-base" />
                      </button>
                      <button
                        type="button"
                        title="삭제"
                        disabled={busy}
                        onClick={() => void remove(d)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
