"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Card, Icon, FieldChip, EmptyState } from "@/shared/components/ui";
import { addDays, toDate, ymd } from "../lib/schedule";

/**
 * 공정표(간트) — 설비별로 그룹핑해 계획(윗줄)·실적(아랫줄) 막대를 함께 보여준다.
 * 원본(legacy/plantsync/src/pages/Schedule.jsx)의 계산 로직은 서버(API)로 옮기고,
 * 이 화면은 받은 결과를 그리는 데만 집중한다.
 */

interface TaskSchedule {
  startOff: number;
  endOff: number;
  plannedStartStr: string;
  plannedEndStr: string;
}

interface ActualBar {
  startOff: number;
  endOff: number;
  real: boolean;
  startStr?: string;
  endStr?: string;
}

interface Row {
  id: string;
  name: string;
  unit: string | null;
  field: string | null;
  equipment: string;
  planQty: number;
  doneQty: number;
  sch: TaskSchedule;
  actual: number;
  planned: number;
  behind: boolean;
  status: string;
  actualBar: ActualBar | null;
}

interface Payload {
  project: { start_date: string | null; end_date: string | null };
  hasPeriod: boolean;
  total: number;
  todayOff: number;
  plannedPct: number;
  riskCount: number;
  rows: Row[];
}

// Tailwind 4엔 safelist가 없어 `bg-${color}` 같은 동적 클래스가 빌드에서 빠진다.
// 고정된 몇 가지 색만 쓰므로 리터럴 맵으로 고정한다.
const BAR_STYLE = {
  primary: { bg: "bg-primary", text: "text-primary" },
  success: { bg: "bg-status-success", text: "text-status-success" },
  error: { bg: "bg-status-error", text: "text-status-error" },
  info: { bg: "bg-status-info", text: "text-status-info" },
} as const;
type BarColor = keyof typeof BAR_STYLE;

const FIELD_BAR: Record<string, BarColor> = { 기계: "primary", 전기: "success", 제어: "info" };

function barColorOf(row: Row): BarColor {
  if (row.actual >= 100) return "success";
  if (row.behind) return "error";
  return FIELD_BAR[row.field ?? ""] ?? "primary";
}

/** 기간 눈금 생성 (약 6~8개) */
function makeTicks(total: number) {
  const step = Math.max(1, Math.ceil(total / 7));
  const ticks: number[] = [];
  for (let d = 0; d <= total; d += step) ticks.push(d);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);
  return ticks;
}

export default function Schedule() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [field, setField] = useState("전체");
  const [equipment, setEquipment] = useState("전체");
  const [onlyDelay, setOnlyDelay] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void (async () => {
      const json = await (await fetch("/api/overhaul/schedule")).json();
      if (json.ok) setData(json);
      setLoading(false);
    })();
  }, []);

  const total = data?.total ?? 1;
  const todayOff = data?.todayOff ?? 0;
  const ticks = useMemo(() => makeTicks(total), [total]);
  const startDate = data?.project.start_date;

  const equipmentOptions = useMemo(
    () => ["전체", ...new Set((data?.rows ?? []).map((r) => r.equipment))],
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(
      (r) =>
        (field === "전체" || r.field === field) &&
        (equipment === "전체" || r.equipment === equipment) &&
        (!onlyDelay || r.behind),
    );
  }, [data, field, equipment, onlyDelay]);

  const groups = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of rows) (map[r.equipment] ||= []).push(r);
    return Object.entries(map)
      .map(([equip, list]) => {
        const minOff = Math.min(...list.map((r) => r.sch.startOff));
        const maxOff = Math.max(...list.map((r) => r.sch.endOff));
        let plan = 0;
        let done = 0;
        for (const r of list) {
          plan += r.planQty;
          done += Math.min(r.doneQty, r.planQty);
        }
        const progress = plan > 0 ? Math.round((done / plan) * 1000) / 10 : 0;
        return {
          equip,
          field: list[0].field,
          list,
          minOff,
          maxOff,
          progress,
          behind: list.some((r) => r.behind),
        };
      })
      .sort((a, b) => a.minOff - b.minOff);
  }, [rows]);

  const pos = (off: number) => `${(off / total) * 100}%`;

  if (loading) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  if (!data || data.rows.length === 0) {
    return (
      <>
        <h1 className="text-display-lg text-on-surface pt-2">공정표</h1>
        <Card lift={false} className="p-0">
          <EmptyState
            icon="calendar_view_week"
            title="공정표를 생성할 작업이 없습니다"
            desc="먼저 업로드 분석에서 설계내역서를 올려 작업항목을 만드세요."
            action={
              <Link
                href="/overhaul/upload"
                className="px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-primary text-on-primary hover:opacity-90"
              >
                업로드 분석으로
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface">공정표</h1>
          <p className="text-on-surface-variant text-body-md">
            {data.hasPeriod
              ? `작업명 키워드 기준으로 자동 배치된 계획일정입니다. (오버홀 ${startDate} ~ ${data.project.end_date} · 총 ${total}일)`
              : "계약기간이 설정되지 않아 전체 기간 대비 배치를 계산할 수 없습니다. 업로드 분석에서 계약기간을 먼저 설정하세요."}
          </p>
        </div>
        {data.hasPeriod && (
          <div className="text-right">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              오늘 계획공정률
            </p>
            <p className="text-2xl font-black text-primary leading-tight">{data.plannedPct}%</p>
          </div>
        )}
      </div>

      {!data.hasPeriod ? (
        <Card lift={false} className="p-card-padding">
          <div className="flex items-center gap-3">
            <Icon name="event_busy" className="text-status-warning" />
            <Link href="/overhaul/upload" className="text-primary text-sm font-semibold hover:underline">
              계약기간 설정하러 가기
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* 필터 + 범례 */}
          <Card lift={false} className="p-card-padding">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex flex-wrap gap-3 flex-1">
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
                >
                  {["전체", "기계", "전기", "제어"].map((f) => (
                    <option key={f} value={f}>
                      {f === "전체" ? "분야: 전체" : f}
                    </option>
                  ))}
                </select>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
                >
                  {equipmentOptions.map((eq) => (
                    <option key={eq} value={eq}>
                      {eq === "전체" ? "설비: 전체" : eq}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setOnlyDelay((v) => !v)}
                  className={`h-11 px-4 rounded-xl text-sm font-semibold border transition-colors flex items-center gap-2 ${
                    onlyDelay
                      ? "bg-error/10 border-error/30 text-error"
                      : "bg-surface-container-low border-border-subtle text-on-surface-variant"
                  }`}
                >
                  <Icon name="warning" className="text-base" fill={onlyDelay} /> 지연 위험만
                </button>
              </div>
              <div className="flex items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-full bg-surface-container-highest" /> 윗줄=계획
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-full bg-primary" /> 아랫줄=실적
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-full bg-status-success" /> 완료
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-full bg-status-error" /> 지연
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-0.5 h-3 bg-status-error" /> 오늘
                </span>
              </div>
            </div>
          </Card>

          {/* 간트차트 */}
          <Card lift={false} className="p-card-padding overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                {/* 타임라인 헤더 */}
                <div className="flex items-stretch border-b border-border-subtle pb-2 mb-2">
                  <div className="w-[220px] shrink-0 text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-end">
                    설비 / 작업
                  </div>
                  <div className="relative flex-1 h-8">
                    {ticks.map((d) => (
                      <div
                        key={d}
                        className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2"
                        style={{ left: pos(d) }}
                      >
                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap">
                          {startDate ? ymd(addDays(toDate(startDate), d)).slice(5) : ""}
                        </span>
                        <span className="text-[9px] text-on-surface-variant/60">D+{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 그룹/작업 행 */}
                <div className="relative">
                  {/* 오늘 기준선 */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-status-error/70 z-10 pointer-events-none"
                    style={{ left: `calc(220px + (100% - 220px) * ${todayOff / total})` }}
                  >
                    <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] font-bold text-status-error bg-surface px-1 rounded">
                      오늘
                    </span>
                  </div>

                  {groups.map((g) => {
                    const isOpen = !collapsed[g.equip];
                    return (
                      <div key={g.equip}>
                        {/* 설비 요약 행 */}
                        <div
                          className="flex items-center py-2 cursor-pointer hover:bg-surface-container-low rounded-lg transition-colors"
                          onClick={() => setCollapsed((c) => ({ ...c, [g.equip]: isOpen }))}
                        >
                          <div className="w-[220px] shrink-0 pr-3 flex items-center gap-1.5">
                            <Icon
                              name={isOpen ? "expand_more" : "chevron_right"}
                              className="text-base text-on-surface-variant"
                            />
                            <FieldChip field={g.field ?? "미분류"} />
                            <span className="font-mono-data text-sm font-bold text-on-surface truncate">
                              {g.equip}
                            </span>
                            <span className="text-xs text-on-surface-variant">({g.list.length})</span>
                          </div>
                          <div className="relative flex-1 h-6">
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full bg-surface-container-highest overflow-hidden"
                              style={{ left: pos(g.minOff), width: pos(Math.max(1, g.maxOff - g.minOff)) }}
                            >
                              <div
                                className={`h-full rounded-full ${g.behind ? "bg-status-error" : "bg-primary"}`}
                                style={{ width: `${g.progress}%` }}
                              />
                            </div>
                            <span
                              className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant"
                              style={{ left: `calc(${pos(g.maxOff)} + 6px)` }}
                            >
                              {g.progress}%
                            </span>
                          </div>
                        </div>

                        {/* 작업 상세 행 — 윗줄 계획 / 아랫줄 실적 */}
                        {isOpen &&
                          g.list.map((r) => {
                            const barColor = barColorOf(r);
                            const labelOff = Math.max(r.sch.endOff, r.actualBar?.endOff || 0);
                            return (
                              <Link
                                key={r.id}
                                href={`/overhaul/entry?task=${r.id}`}
                                className="flex items-center py-1.5 group cursor-pointer border-b border-border-subtle/40 last:border-0"
                              >
                                <div className="w-[220px] shrink-0 pr-3 pl-7">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                                      {r.name}
                                    </p>
                                    {r.actual >= 100 && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-status-success/15 text-status-success shrink-0 flex items-center gap-0.5">
                                        <Icon name="check" className="text-[10px]" /> 완료
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-on-surface-variant font-mono-data">
                                    계획 {r.sch.plannedStartStr.slice(5)}~{r.sch.plannedEndStr.slice(5)}
                                  </p>
                                  <p
                                    className={`text-[10px] font-mono-data ${
                                      r.actualBar ? BAR_STYLE[barColor].text : "text-on-surface-variant/50"
                                    }`}
                                  >
                                    {r.actualBar?.real
                                      ? `실적 ${r.actualBar.startStr!.slice(5)}~${r.actualBar.endStr!.slice(5)}`
                                      : r.actual > 0
                                        ? `실적 ${r.actual}% · 일자 미입력`
                                        : "실적 미입력"}
                                  </p>
                                </div>
                                <div className="relative flex-1 h-11">
                                  {/* 계획 (윗줄) */}
                                  <div
                                    className="absolute top-1.5 h-2.5 rounded-full bg-surface-container-highest"
                                    style={{
                                      left: pos(r.sch.startOff),
                                      width: pos(Math.max(1, r.sch.endOff - r.sch.startOff)),
                                    }}
                                    title={`계획 ${r.sch.plannedStartStr} ~ ${r.sch.plannedEndStr}`}
                                  />
                                  {/* 실적 (아랫줄) */}
                                  {r.actualBar ? (
                                    <div
                                      className={`absolute top-6 h-2.5 rounded-full ${BAR_STYLE[barColor].bg} ${
                                        r.actualBar.real ? "" : "opacity-60"
                                      } group-hover:ring-2 group-hover:ring-primary/20`}
                                      style={{
                                        left: pos(r.actualBar.startOff),
                                        width: pos(Math.max(1, r.actualBar.endOff - r.actualBar.startOff)),
                                      }}
                                      title={`실적 ${r.actual}%`}
                                    />
                                  ) : (
                                    <div
                                      className="absolute top-6 h-2.5 rounded-full border border-dashed border-outline-variant"
                                      style={{
                                        left: pos(r.sch.startOff),
                                        width: pos(Math.max(1, r.sch.endOff - r.sch.startOff)),
                                      }}
                                    />
                                  )}
                                  {/* 진행률 라벨 */}
                                  <span
                                    className={`absolute top-[13px] text-[10px] font-bold ${BAR_STYLE[barColor].text}`}
                                    style={{ left: `calc(${pos(labelOff)} + 6px)` }}
                                  >
                                    {r.actual}%
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* 요약 지표 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
            <Card className="p-card-padding">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
                계획 공정률
              </p>
              <p className="text-2xl font-black text-on-surface">{data.plannedPct}%</p>
              <p className="text-xs text-on-surface-variant mt-1">오늘 기준</p>
            </Card>
            <Card className="p-card-padding">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
                지연 위험 공정
              </p>
              <p className="text-2xl font-black text-error">{rows.filter((r) => r.behind).length}건</p>
              <p className="text-xs text-error mt-1">계획 대비 15%p+ 미달</p>
            </Card>
            <Card className="p-card-padding">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
                표시 설비
              </p>
              <p className="text-2xl font-black text-on-surface">{groups.length}개</p>
              <p className="text-xs text-on-surface-variant mt-1">작업 {rows.length}건</p>
            </Card>
            <Card className="p-card-padding">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
                경과 / 전체
              </p>
              <p className="text-2xl font-black text-on-surface">
                {todayOff} / {total}일
              </p>
              <p className="text-xs text-on-surface-variant mt-1">~ {data.project.end_date}</p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
