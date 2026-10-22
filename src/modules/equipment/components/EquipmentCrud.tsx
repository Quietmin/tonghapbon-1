"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, FieldChip, Icon } from "@/shared/components/ui";
import { EQUIPMENT_FIELDS, EQUIPMENT_TYPES } from "@/shared/lib/equipmentMeta";
import type { Device, EquipmentWithCount } from "@/shared/lib/equipment";

/**
 * 활성 지사의 설비 → 기기·태그 2단 CRUD.
 *
 * 위쪽은 설비 목록(등록·수정·삭제), 행을 고르면 아래에 그 설비의 기기·태그
 * 목록이 붙는다. 여기서 지운 설비는 보수계획·작업의 연결만 끊기고(set null)
 * 그 데이터 자체는 남는다. 기기·태그는 설비에 딸려 함께 지워진다.
 *
 * 목록에 손으로 만든 적 없는 설비가 보이는 건 정상이다 — 엑셀 업로드·수동
 * 추가가 대분류/설비유형을 마스터에 자동 등록하기 때문 (ensureEquipment).
 */

// ---------------------------------------------------------------------------
// 설비 폼 — 추가("new")와 수정(기존 행)을 한 컴포넌트로 처리한다
// ---------------------------------------------------------------------------

interface EquipForm {
  name: string;
  type: string;
  field: string;
  note: string;
}

const BLANK_EQUIP: EquipForm = { name: "", type: "", field: "", note: "" };

function equipToForm(e: EquipmentWithCount): EquipForm {
  return { name: e.name, type: e.type ?? "", field: e.field ?? "", note: e.note ?? "" };
}

function EquipmentForm({
  target,
  onDone,
  onCancel,
}: {
  target: EquipmentWithCount | "new";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EquipForm>(target === "new" ? BLANK_EQUIP : equipToForm(target));
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
          <input
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: 1호기 HRSG"
          />
        </div>
        <div>
          <p className={label}>유형</p>
          <select
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
          <select
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
          <input
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
    <div className="rounded-xl border border-border-subtle bg-surface-container-low p-4 mt-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <p className={label}>태그</p>
          <input
            className="input mt-1"
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value })}
            placeholder="예: PIT-7610"
          />
        </div>
        <div>
          <p className={label}>기기명</p>
          <input
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: 압력계 (선택)"
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <p className={label}>규격</p>
          <input
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
// 목록 + 2단
// ---------------------------------------------------------------------------

export default function EquipmentCrud({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<EquipmentWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 설비 폼의 대상 — null이면 폼 닫힘 */
  const [editing, setEditing] = useState<EquipmentWithCount | "new" | null>(null);
  /** 2단(기기·태그)을 펼친 설비 id */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devEditing, setDevEditing] = useState<Device | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await (await fetch("/api/equipment")).json();
      if (json.ok) {
        setItems(json.items);
        setError(null);
      } else setError(json.error ?? "목록을 불러오지 못했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDevices = useCallback(async (equipmentId: string) => {
    setDevices(null);
    try {
      const json = await (await fetch(`/api/equipment/device?equipmentId=${equipmentId}`)).json();
      if (json.ok) setDevices(json.items);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDevices(selectedId);
    else setDevices(null);
    setDevEditing(null);
  }, [selectedId, loadDevices]);

  /** 설비가 늘거나 줄면 장기 계획 표도 다시 그려야 한다 */
  const changed = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  const removeEquipment = async (e: EquipmentWithCount) => {
    const extra = e.device_count ? ` 딸린 기기·태그 ${e.device_count}개도 함께 지워집니다.` : "";
    if (!confirm(`"${e.name}" 설비를 삭제할까요?${extra}`)) return;
    setBusy(true);
    try {
      const json = await (await fetch(`/api/equipment?id=${e.id}`, { method: "DELETE" })).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      if (selectedId === e.id) setSelectedId(null);
      if (editing !== "new" && editing?.id === e.id) setEditing(null);
      changed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (d: Device) => {
    if (!confirm(`태그 "${d.tag}"를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const json = await (
        await fetch(`/api/equipment/device?id=${d.id}`, { method: "DELETE" })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      if (devEditing !== "new" && devEditing?.id === d.id) setDevEditing(null);
      if (selectedId) await loadDevices(selectedId);
      await load(); // 기기 수 갱신
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!items && !error) {
    return <p className="py-10 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  const selected = items?.find((e) => e.id === selectedId) ?? null;
  const th = "py-3 text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest";

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="precision_manufacturing" className="text-base text-primary" />
          설비 목록
        </h2>
        <Button onClick={() => setEditing("new")} disabled={editing === "new"}>
          <Icon name="add" className="text-base" />
          설비 추가
        </Button>
      </div>

      {error && (
        <Card className="p-4 border border-error/30" lift={false}>
          <p className="text-sm text-error flex items-center gap-2">
            <Icon name="error" className="text-base" />
            {error}
          </p>
        </Card>
      )}

      {editing && (
        <EquipmentForm
          target={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            changed();
          }}
        />
      )}

      <Card lift={false} className="p-0 overflow-hidden">
        {items && items.length === 0 ? (
          <EmptyState
            icon="precision_manufacturing"
            title="등록된 설비가 없습니다"
            desc="설비를 직접 추가하거나, 보수계획·오버홀 엑셀을 올리면 자동으로 채워집니다."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className={`${th} pl-card-padding`}>설비명</th>
                  <th className={th}>유형</th>
                  <th className={th}>분야</th>
                  <th className={th}>기기·태그</th>
                  <th className={th}>비고</th>
                  <th className={`${th} pr-card-padding text-right`}>관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items?.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(selectedId === e.id ? null : e.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedId === e.id
                        ? "bg-primary-container/30"
                        : "hover:bg-surface-container-low"
                    }`}
                  >
                    <td className="py-3 pl-card-padding text-sm font-bold text-on-surface">
                      <span className="flex items-center gap-2">
                        <Icon
                          name={selectedId === e.id ? "expand_less" : "expand_more"}
                          className="text-base text-on-surface-variant"
                        />
                        {e.name}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-on-surface">{e.type ?? "—"}</td>
                    <td className="py-3">
                      {e.field ? (
                        <FieldChip field={e.field} />
                      ) : (
                        <span className="text-sm text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="py-3 text-sm text-on-surface">{e.device_count}개</td>
                    <td className="py-3 text-sm text-on-surface-variant max-w-[240px] truncate">
                      {e.note ?? ""}
                    </td>
                    <td className="py-3 pr-card-padding">
                      <span className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="수정"
                          disabled={busy}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditing(e);
                          }}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary-container/30 transition-colors"
                        >
                          <Icon name="edit" className="text-base" />
                        </button>
                        <button
                          type="button"
                          title="삭제"
                          disabled={busy}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void removeEquipment(e);
                          }}
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
      </Card>

      {selected && (
        <Card lift={false} className="p-card-padding">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title-sm text-on-surface flex items-center gap-2">
              <Icon name="sell" className="text-base text-primary" />
              기기·태그 — {selected.name}
            </h2>
            <Button
              variant="ghost"
              onClick={() => setDevEditing("new")}
              disabled={devEditing === "new"}
            >
              <Icon name="add" className="text-base" />
              기기 추가
            </Button>
          </div>

          {devEditing && (
            <DeviceFormCard
              equipmentId={selected.id}
              target={devEditing}
              onCancel={() => setDevEditing(null)}
              onDone={() => {
                setDevEditing(null);
                void loadDevices(selected.id);
                void load();
              }}
            />
          )}

          {!devices ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">불러오는 중…</p>
          ) : devices.length === 0 ? (
            <EmptyState
              icon="sell"
              title="등록된 기기·태그가 없습니다"
              desc="태그(예: PIT-7610)를 등록하면 챗봇의 태그 정확일치 검색 대상이 됩니다."
            />
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left min-w-[560px]">
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
                      <td className="py-3 text-sm font-bold text-on-surface">{d.tag}</td>
                      <td className="py-3 text-sm text-on-surface">{d.name ?? "—"}</td>
                      <td className="py-3 text-sm text-on-surface-variant">{d.spec ?? "—"}</td>
                      <td className="py-3">
                        <span className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="수정"
                            disabled={busy}
                            onClick={() => setDevEditing(d)}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary-container/30 transition-colors"
                          >
                            <Icon name="edit" className="text-base" />
                          </button>
                          <button
                            type="button"
                            title="삭제"
                            disabled={busy}
                            onClick={() => void removeDevice(d)}
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
        </Card>
      )}
    </>
  );
}
