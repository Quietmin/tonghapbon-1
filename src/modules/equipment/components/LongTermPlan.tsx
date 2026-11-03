"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, FieldChip, Icon, LoadingState } from "@/shared/components/ui";
import type {
  LongTermCell,
  LongTermItem,
  LongTermItemCell,
  LongTermPayload,
  LongTermRow,
} from "@/modules/equipment/lib/longTermRepo";
import { DevicePanel, EquipmentForm, type EquipmentFormTarget } from "./EquipmentForms";

/**
 * 설비 마스터의 단일 표 — 설비마다 장기 유지보수 계획(과거 2년~향후 2년)과
 * 기준정보(유형·기기 수·비고)를 한 줄에 함께 보여주고, 그 자리에서 관리한다.
 *
 * 예전에는 이 표(계획 조망) 아래에 "설비 목록" 표(기준정보 CRUD)가 따로 있었다.
 * 같은 설비를 한 화면에서 두 번 나열하는 셈이라, 행 펼침이 생긴 뒤로는 중복이
 * 더 뚜렷해져 하나로 합쳤다. 이제 행을 펼치면 그 설비의 모든 것이 한 곳에 모인다:
 *   ① 보수계획 항목(태그번호·제작사·규격·주기·연도별 등급)
 *   ② 기기·태그 기준정보 (챗봇 태그 검색·QR 확대방안의 기반)
 *
 * 연도 판정은 전체 현황(/overhaul/matrix)과 같은 소스(listPlanMatrix)를 쓴다 —
 * 두 화면의 판정이 어긋나면 안 되기 때문. 전체 연도 축은 거기서 본다.
 */

function YearCell({ cell, isThisYear }: { cell: LongTermCell; isThisYear: boolean }) {
  const base = "w-9 h-7 mx-auto rounded-md flex items-center justify-center text-xs font-bold";
  const ring = isThisYear ? " ring-2 ring-primary ring-offset-1" : "";
  if (cell.done) {
    return (
      <div title={`실적 ${cell.done}건`} className={`${base} bg-status-success text-on-primary${ring}`}>
        {cell.done}
      </div>
    );
  }
  if (cell.planned) {
    return (
      <div
        title={`계획 ${cell.planned}건`}
        className={`${base} bg-primary/15 border border-primary/30 text-primary${ring}`}
      >
        {cell.planned}
      </div>
    );
  }
  if (cell.projected) {
    return (
      <div
        title={`주기상 예정 ${cell.projected}건`}
        className={`${base} border border-dashed border-outline-variant text-on-surface-variant${ring}`}
      >
        {cell.projected}
      </div>
    );
  }
  if (cell.skipped) {
    return (
      <div
        title={`확인 후 보수 안 함 ${cell.skipped}건`}
        className={`${base} bg-surface-container-highest text-on-surface-variant${ring}`}
      >
        ✕
      </div>
    );
  }
  return <div className={base + (isThisYear ? " ring-1 ring-primary/40" : "")} />;
}

/** 펼침 패널의 연도 한 칸 — 집계 칸과 같은 색 규칙의 축소판. 등급이 있으면 등급을 보여준다 */
function ItemYearCell({ cell, isThisYear }: { cell: LongTermItemCell; isThisYear: boolean }) {
  const base =
    "w-7 h-6 mx-auto rounded flex items-center justify-center text-[10px] md:text-[11px] font-bold";
  const ring = isThisYear ? " ring-1 ring-primary ring-offset-1" : "";
  if (cell.status === "done") {
    return (
      <div title={`실적${cell.grade ? ` ${cell.grade}등급` : ""}`} className={`${base} bg-status-success text-on-primary${ring}`}>
        {cell.grade ?? "✓"}
      </div>
    );
  }
  if (cell.status === "planned") {
    return (
      <div title={`계획${cell.grade ? ` ${cell.grade}등급` : ""}`} className={`${base} bg-primary/15 border border-primary/30 text-primary${ring}`}>
        {cell.grade ?? "·"}
      </div>
    );
  }
  if (cell.status === "projected") {
    return (
      <div
        title={`주기상 예정${cell.grade ? ` (추정 ${cell.grade}등급)` : ""}`}
        className={`${base} border border-dashed border-outline-variant text-on-surface-variant${ring}`}
      >
        {cell.grade ?? "·"}
      </div>
    );
  }
  if (cell.status === "skipped") {
    return (
      <div title="확인 후 보수 안 함" className={`${base} bg-surface-container-highest text-on-surface-variant${ring}`}>
        ✕
      </div>
    );
  }
  return <div className={base + (isThisYear ? " ring-1 ring-primary/30" : "")} />;
}

/** 행을 펼쳤을 때 나오는 항목(태그) 상세 표 */
function ItemDetail({ items, years, thisYear }: { items: LongTermItem[]; years: number[]; thisYear: number }) {
  const th = "py-2 px-2 text-on-surface-variant text-xs font-semibold whitespace-nowrap";
  return (
    <div className="mx-2 my-2 rounded-xl border border-border-subtle bg-surface-container-low overflow-x-auto">
      <table className="w-full text-left" style={{ minWidth: 640 + years.length * 36 }}>
        <thead>
          <tr className="border-b border-border-subtle">
            <th className={`${th} min-w-[160px]`}>항목(기기)</th>
            <th className={th}>태그번호</th>
            <th className={th}>제작사</th>
            <th className={th}>규격</th>
            <th className={`${th} text-center`}>주기</th>
            {years.map((y) => (
              <th key={y} className={`${th} text-center w-9 font-mono-data ${y === thisYear ? "text-primary" : ""}`}>
                {String(y).slice(2)}
              </th>
            ))}
            <th className={`${th} text-center`}>최근</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {items.map((it) => (
            <tr key={it.planId}>
              <td className="py-2 px-2 text-[12px] md:text-[13px] font-semibold text-on-surface">{it.name}</td>
              <td className="py-2 px-2 text-[12px] font-mono-data text-on-surface-variant whitespace-nowrap">
                {it.tagNo ?? "—"}
              </td>
              <td className="py-2 px-2 text-[12px] text-on-surface-variant whitespace-nowrap">{it.maker ?? "—"}</td>
              <td className="py-2 px-2 text-[12px] text-on-surface-variant">{it.spec ?? "—"}</td>
              <td className="py-2 px-2 text-[12px] text-center font-mono-data text-on-surface-variant whitespace-nowrap">
                {it.cycleLabel ?? "—"}
              </td>
              {it.cells.map((c) => (
                <td key={c.year} className="py-2 text-center">
                  <ItemYearCell cell={c} isThisYear={c.year === thisYear} />
                </td>
              ))}
              <td className="py-2 px-2 text-[12px] text-center font-mono-data text-on-surface-variant">
                {it.lastDoneYear ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LongTermPlan({
  branch,
  fieldFilter,
}: {
  branch: string;
  /** 분야 필터 — null이면 전체. 분야가 비어 있는 행(마스터 미등록 등)은 전체에서만 보인다. */
  fieldFilter?: string | null;
}) {
  const [data, setData] = useState<LongTermPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 펼쳐진 행의 키(설비 id 또는 plan:이름) — 여러 행을 동시에 펼칠 수 있다 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 표의 가운데 해 — null이면 올해. 판정(도래·예정)도 이 해 기준으로 계산된다 */
  const [baseYear, setBaseYear] = useState<number | null>(null);
  /** 설비 폼의 대상 — null이면 폼 닫힘 */
  const [editing, setEditing] = useState<EquipmentFormTarget | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const nowYear = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      const base = baseYear ? `&baseYear=${baseYear}` : "";
      const json = await (
        await fetch(`/api/equipment/longterm?branch=${encodeURIComponent(branch)}${base}`)
      ).json();
      if (json.ok) {
        setData(json);
        setError(null);
      } else setError(json.error ?? "장기 계획을 불러오지 못했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [branch, baseYear]);

  useEffect(() => {
    setData(null);
    setError(null);
    setExpanded(new Set());
    setEditing(null);
    void load();
  }, [load]);

  // ── 설비 기준정보 관리 — 예전 "설비 목록" 표가 하던 일 ────────────────────
  const removeEquipment = async (r: LongTermRow) => {
    if (!r.equipmentId) return;
    const extra = r.deviceCount ? ` 딸린 기기·태그 ${r.deviceCount}개도 함께 지워집니다.` : "";
    if (!confirm(`"${r.name}" 설비를 삭제할까요?${extra}`)) return;
    setBusy(true);
    try {
      const json = await (await fetch(`/api/equipment?id=${r.equipmentId}`, { method: "DELETE" })).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 지사 전체 초기화 — 엑셀을 새로 올려 처음부터 구성하고 싶을 때. 두 번 묻는다 */
  const resetAll = async () => {
    const targets = (data?.rows ?? []).filter((r) => r.equipmentId);
    if (!targets.length) return;
    const deviceTotal = targets.reduce((n, r) => n + r.deviceCount, 0);
    const msg =
      `이 지사의 설비 ${targets.length}개를 모두 삭제할까요?` +
      (deviceTotal ? ` 딸린 기기·태그 ${deviceTotal}개도 함께 지워집니다.` : "") +
      `\n보수계획·고장이력·작업 데이터는 남지만, 설비와의 연결은 끊어집니다.`;
    if (!confirm(msg)) return;
    if (!confirm("정말 초기화할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    try {
      const json = await (await fetch("/api/equipment?all=1", { method: "DELETE" })).json();
      if (!json.ok) throw new Error(json.error ?? "초기화에 실패했습니다.");
      setExpanded(new Set());
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const th = "py-3 text-on-surface-variant text-[12px] md:text-[13px] font-semibold uppercase tracking-widest";

  const rows = data ? (fieldFilter ? data.rows.filter((r) => r.field === fieldFilter) : data.rows) : [];
  const hasEquipment = !!data?.rows.some((r) => r.equipmentId);

  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="calendar_month" className="text-base text-primary" />
          장기 유지보수 계획
          <select aria-label="기준 년도"
            value={baseYear ?? nowYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setBaseYear(y === nowYear ? null : y);
            }}
            title="기준년도 — 이 해를 가운데에 두고 앞뒤 2년씩 보여줍니다"
            className="ml-1 h-7 px-2 rounded-lg bg-surface-container-low border border-border-subtle text-xs font-bold outline-none focus:border-primary"
          >
            {Array.from({ length: 11 }, (_, k) => nowYear - 5 + k).map((y) => (
              <option key={y} value={y}>
                기준 {y}년{y === nowYear ? " (올해)" : ""}
              </option>
            ))}
          </select>
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded bg-status-success inline-block" />
            실적
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/30 inline-block" />
            계획
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded border border-dashed border-outline-variant inline-block" />
            주기상 예정
          </span>
          <span>✕ 보수 안 함 · 숫자는 항목 수</span>
          <span className="flex items-center gap-2">
            {hasEquipment && (
              <Button
                variant="ghost"
                onClick={() => void resetAll()}
                disabled={busy}
                title="이 지사의 설비·기기를 모두 삭제하고 처음부터 다시 구성합니다"
                className="text-error hover:bg-error/10"
              >
                <Icon name="delete_sweep" className="text-base" />
                전체 삭제
              </Button>
            )}
            <Button onClick={() => setEditing("new")} disabled={editing === "new" || busy}>
              <Icon name="add" className="text-base" />
              설비 추가
            </Button>
          </span>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mt-1.5">
        설비마다 과거 2년·올해·향후 2년 계획과 기준정보를 함께 봅니다. 행을 누르면 보수계획 항목(태그번호·제작사·규격)과
        기기·태그가 펼쳐집니다. 전체 연도 축은 설비별 전체 현황에서 봅니다.
      </p>

      {error && (
        <p className="mt-3 text-sm text-error flex items-center gap-1.5">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}

      {editing && (
        <div className="mt-3">
          <EquipmentForm
            target={editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              void load();
            }}
          />
        </div>
      )}

      {!data && !error ? (
        <LoadingState />
      ) : data && rows.length === 0 ? (
        <EmptyState
          icon="calendar_month"
          title={fieldFilter && data.rows.length ? `${fieldFilter} 분야 설비가 없습니다` : "등록된 설비가 없습니다"}
          desc={
            fieldFilter && data.rows.length
              ? "분야를 전체로 바꾸거나, 설비의 분야를 수정해 보세요."
              : "[설비 추가]로 직접 등록하거나, 보수계획·오버홀 엑셀을 올리면 자동으로 채워집니다."
          }
        />
      ) : data ? (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left" style={{ minWidth: 820 + data.years.length * 44 }}>
            <thead>
              <tr className="border-b border-border-subtle">
                <th className={`${th} sticky left-0 z-10 bg-surface-container-lowest min-w-[220px]`}>
                  설비
                </th>
                <th className={th}>분야</th>
                <th className={th}>유형</th>
                <th className={`${th} text-right pr-2`}>항목</th>
                <th className={`${th} text-right pr-2`}>기기</th>
                {data.years.map((y) => (
                  <th
                    key={y}
                    className={`${th} text-center w-11 font-mono-data ${
                      y === data.thisYear
                        ? "text-primary"
                        : y > data.thisYear
                          ? "text-on-surface-variant"
                          : ""
                    }`}
                  >
                    {String(y).slice(2)}
                  </th>
                ))}
                <th className={`${th} text-center`}>최근 실적</th>
                <th className={`${th} pr-card-padding text-right`}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => {
                const key = r.equipmentId ?? `plan:${r.name}`;
                // 등록된 설비는 기기·태그를 관리해야 하니 항목이 없어도 펼칠 수 있다
                const canExpand = r.itemCount > 0 || !!r.equipmentId;
                const isOpen = expanded.has(key);
                return [
                  <tr
                    key={key}
                    onClick={() => {
                      if (!canExpand) return;
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                    title={canExpand ? "눌러서 보수계획 항목·기기 태그 보기" : undefined}
                    className={`hover:bg-surface-container-low transition-colors${canExpand ? " cursor-pointer" : ""}`}
                  >
                    <td className="py-2.5 sticky left-0 z-10 bg-surface-container-lowest text-sm font-bold text-on-surface">
                      <span className="flex items-center gap-1.5">
                        {canExpand ? (
                          <Icon
                            name={isOpen ? "expand_more" : "chevron_right"}
                            className="text-base text-on-surface-variant shrink-0"
                          />
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        {r.name}
                        {!r.equipmentId && (
                          <span
                            title="보수계획에는 있지만 설비 마스터에 등록되지 않은 이름입니다"
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-status-warning/10 text-status-warning-text"
                          >
                            마스터 미등록
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {r.field ? (
                        <FieldChip field={r.field} />
                      ) : (
                        <span className="text-sm text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-sm text-on-surface">{r.type ?? "—"}</td>
                    <td className="py-2.5 pr-2 text-right text-sm font-mono-data text-on-surface-variant">
                      {r.itemCount || "—"}
                    </td>
                    <td className="py-2.5 pr-2 text-right text-sm font-mono-data text-on-surface-variant">
                      {r.equipmentId ? r.deviceCount : "—"}
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.year} className="py-2.5 text-center">
                        <YearCell cell={c} isThisYear={c.year === data.thisYear} />
                      </td>
                    ))}
                    <td className="py-2.5 text-center text-sm font-mono-data text-on-surface-variant">
                      {r.lastDoneYear ?? "—"}
                    </td>
                    <td className="py-2.5 pr-card-padding">
                      {/* 마스터 미등록 행은 설비 레코드가 없어 수정·삭제할 대상이 없다 */}
                      {r.equipmentId ? (
                        <span className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="설비 정보 수정"
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setEditing({
                                id: r.equipmentId!,
                                name: r.name,
                                type: r.type,
                                field: r.field,
                                note: r.note,
                              });
                            }}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary-container/30 transition-colors"
                          >
                            <Icon name="edit" className="text-base" />
                          </button>
                          <button
                            type="button"
                            title="설비 삭제"
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void removeEquipment(r);
                            }}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                          >
                            <Icon name="delete" className="text-base" />
                          </button>
                        </span>
                      ) : (
                        <span className="block text-right text-sm text-on-surface-variant">—</span>
                      )}
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${key}:detail`}>
                      <td colSpan={7 + data.years.length} className="p-0 bg-surface-container-lowest">
                        <div className="px-3 pb-3">
                          {r.itemCount > 0 && (
                            <ItemDetail items={r.items} years={data.years} thisYear={data.thisYear} />
                          )}
                          {r.note && (
                            <p className="mt-2 px-2 text-xs text-on-surface-variant">비고: {r.note}</p>
                          )}
                          {r.equipmentId && (
                            <DevicePanel
                              equipmentId={r.equipmentId}
                              equipmentName={r.name}
                              onChanged={() => void load()}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
