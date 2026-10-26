"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState, FieldChip, Icon } from "@/shared/components/ui";
import type { LongTermCell, LongTermPayload } from "@/modules/equipment/lib/longTermRepo";

/**
 * 설비 단위 장기 유지보수 계획 — 과거 2년 ~ 향후 4년.
 * 연도 판정은 전체 현황(/overhaul/matrix)과 같은 소스(listPlanMatrix)를 쓰고,
 * 여기서는 설비(대분류)로 말아 올린 항목 수만 보여준다.
 * 태그 단위 상세가 필요하면 전체 현황으로 간다.
 */

function YearCell({ cell, isThisYear }: { cell: LongTermCell; isThisYear: boolean }) {
  const base = "w-9 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold";
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

  useEffect(() => {
    setData(null);
    setError(null);
    void (async () => {
      try {
        const json = await (
          await fetch(`/api/equipment/longterm?branch=${encodeURIComponent(branch)}`)
        ).json();
        if (json.ok) setData(json);
        else setError(json.error ?? "장기 계획을 불러오지 못했습니다.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [branch]);

  const th = "py-3 text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest";

  const rows = data ? (fieldFilter ? data.rows.filter((r) => r.field === fieldFilter) : data.rows) : [];

  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="calendar_month" className="text-base text-primary" />
          장기 유지보수 계획
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant">
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
        보수계획·이력 기준으로 설비(대분류) 단위 요약입니다. 태그 단위 상세는 전체 현황에서 봅니다.
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
              {rows.map((r) => (
                <tr key={r.equipmentId ?? `plan:${r.name}`} className="hover:bg-surface-container-low transition-colors">
                  <td className="py-2.5 sticky left-0 z-10 bg-surface-container-lowest text-sm font-bold text-on-surface">
                    <span className="flex items-center gap-2">
                      {r.name}
                      {!r.equipmentId && (
                        <span
                          title="보수계획에는 있지만 설비 마스터에 등록되지 않은 이름입니다"
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-status-warning/10 text-status-warning"
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
