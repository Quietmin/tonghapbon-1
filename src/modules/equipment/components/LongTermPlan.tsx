"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState, FieldChip, Icon } from "@/shared/components/ui";
import type {
  LongTermCell,
  LongTermItem,
  LongTermItemCell,
  LongTermPayload,
} from "@/modules/equipment/lib/longTermRepo";

/**
 * 설비 단위 장기 유지보수 계획 — 과거 2년 ~ 향후 4년.
 * 연도 판정은 전체 현황(/overhaul/matrix)과 같은 소스(listPlanMatrix)를 쓰고,
 * 표에는 설비(대분류)로 말아 올린 항목 수를 보여준다.
 * 행을 누르면 그 대분류에 딸린 개별 항목(태그번호·제작사·규격·주기)이 펼쳐진다 —
 * 전체 연도 축이 필요할 때만 전체 현황으로 간다.
 */

function YearCell({ cell, isThisYear }: { cell: LongTermCell; isThisYear: boolean }) {
  const base = "w-9 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] md:text-[12px] font-bold";
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
  const th = "py-2 px-2 text-on-surface-variant text-[11px] md:text-[12px] font-semibold whitespace-nowrap";
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
  const nowYear = new Date().getFullYear();

  useEffect(() => {
    setData(null);
    setError(null);
    setExpanded(new Set());
    void (async () => {
      try {
        const base = baseYear ? `&baseYear=${baseYear}` : "";
        const json = await (
          await fetch(`/api/equipment/longterm?branch=${encodeURIComponent(branch)}${base}`)
        ).json();
        if (json.ok) setData(json);
        else setError(json.error ?? "장기 계획을 불러오지 못했습니다.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [branch, baseYear]);

  const th = "py-3 text-on-surface-variant text-[12px] md:text-[13px] font-semibold uppercase tracking-widest";

  const rows = data ? (fieldFilter ? data.rows.filter((r) => r.field === fieldFilter) : data.rows) : [];

  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="calendar_month" className="text-base text-primary" />
          장기 유지보수 계획
          <select
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
        <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-[12px] text-on-surface-variant">
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
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mt-1.5">
        과거 2년·올해·향후 2년 요약입니다(설비 대분류 단위). 전체 연도와 태그 단위 상세는 설비별 전체 현황에서 봅니다.
      </p>

      {error && (
        <p className="mt-3 text-sm text-error flex items-center gap-1.5">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      )}

      {!data && !error ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">불러오는 중…</p>
      ) : data && rows.length === 0 ? (
        <EmptyState
          icon="calendar_month"
          title={fieldFilter && data.rows.length ? `${fieldFilter} 분야 설비가 없습니다` : "계획할 설비가 없습니다"}
          desc={
            fieldFilter && data.rows.length
              ? "분야를 전체로 바꾸거나, 설비 목록에서 분야를 지정해 보세요."
              : "설비를 추가하거나 보수계획 엑셀을 올리면 여기에 연도별 계획이 나타납니다."
          }
        />
      ) : data ? (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left" style={{ minWidth: 560 + data.years.length * 44 }}>
            <thead>
              <tr className="border-b border-border-subtle">
                <th className={`${th} sticky left-0 z-10 bg-surface-container-lowest min-w-[220px]`}>
                  설비
                </th>
                <th className={th}>분야</th>
                <th className={`${th} text-right pr-2`}>항목</th>
                {data.years.map((y) => (
                  <th
                    key={y}
                    className={`${th} text-center w-11 font-mono-data ${
                      y === data.thisYear
                        ? "text-primary"
                        : y > data.thisYear
                          ? "text-on-surface-variant/70"
                          : ""
                    }`}
                  >
                    {String(y).slice(2)}
                  </th>
                ))}
                <th className={`${th} text-center`}>최근 실적</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => {
                const key = r.equipmentId ?? `plan:${r.name}`;
                const canExpand = r.itemCount > 0;
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
                    title={canExpand ? "눌러서 개별 항목(태그번호·제작사·규격) 보기" : undefined}
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
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] md:text-[12px] font-bold bg-status-warning/10 text-status-warning"
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
                    <td className="py-2.5 pr-2 text-right text-sm font-mono-data text-on-surface-variant">
                      {r.itemCount || "—"}
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.year} className="py-2.5 text-center">
                        <YearCell cell={c} isThisYear={c.year === data.thisYear} />
                      </td>
                    ))}
                    <td className="py-2.5 text-center text-sm font-mono-data text-on-surface-variant">
                      {r.lastDoneYear ?? "—"}
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${key}:detail`}>
                      <td colSpan={4 + data.years.length} className="p-0 bg-surface-container-lowest">
                        <ItemDetail items={r.items} years={data.years} thisYear={data.thisYear} />
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
