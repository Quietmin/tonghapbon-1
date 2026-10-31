"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, Icon, Button, FieldChip, EmptyState, StatusChip, ScreenHeader, LoadingState } from "@/shared/components/ui";
import { addDays, toDate, ymd } from "../lib/schedule";
import EntryDialog from "./EntryDialog";
import { useEntryHistoryHover } from "./EntryHistoryPreview";

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
  /** excel = 지정된 일정 · auto = 작업명 키워드 자동배치 · none = 계약기간 미설정 */
  source: "excel" | "auto" | "none";
  phase: { key: string; label: string };
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
  success: { bg: "bg-status-success", text: "text-status-success-text" },
  error: { bg: "bg-status-error", text: "text-status-error-text" },
  info: { bg: "bg-status-info", text: "text-status-info-text" },
} as const;
type BarColor = keyof typeof BAR_STYLE;

/**
 * 막대·퍼센트 색 — 범례와 1:1로 맞춘다. 초록은 완료, 빨강은 지연만 뜻한다.
 *
 * 분야별 색(전기=초록)을 쓰면 0%인 전기 작업이 초록으로 칠해져 "완료"로 읽힌다.
 * 분야는 그룹 머리의 칩으로 이미 구분되므로 막대 색까지 쓰지 않는다.
 */
function barColorOf(row: Row): BarColor {
  if (row.actual >= 100) return "success";
  if (row.behind) return "error";
  return "primary";
}

/**
 * 오른쪽 끝에 남겨 두는 여백(px) — 마지막 날짜 눈금과 "100%" 같은 막대 끝 글자가 칸 밖으로
 * 삐져나가 가로 스크롤이 생기지 않게 한다.
 */
const END_GUTTER = 44;

/** 눈금 한 칸이 차지하는 최소 폭(px) — 날짜 글자("10-01")가 서로 겹치지 않을 만큼 */
const TICK_MIN_PX = 64;

/** 설비 묶음을 늘어놓는 분야 순서 — 기계 → 전기 → 제어. 그 밖의 분야·미분류는 맨 뒤 */
const FIELD_ORDER = ["기계", "전기", "제어"];
const fieldRank = (f: string | null) => {
  const i = FIELD_ORDER.indexOf(f ?? "");
  return i === -1 ? FIELD_ORDER.length : i;
};

/** 기간 눈금 생성 — count 개 안팎(타임라인 폭에 맞춰 호출하는 쪽이 정한다) */
function makeTicks(total: number, count: number) {
  const step = Math.max(1, Math.ceil(total / Math.max(2, count)));
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
  /** 계획일정을 손으로 고치는 중인 작업 */
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 실적 입력 팝업을 띄운 작업 id — null 이면 닫힘 */
  const [entryTaskId, setEntryTaskId] = useState<string | null>(null);
  /** 행에 마우스를 올리면 정비 이력을 먼저 보여 주는 미리보기 */
  const { bind: bindHistory, preview: historyPreview, hide: hideHistory } = useEntryHistoryHover();

  const reload = useCallback(async () => {
    const json = await (await fetch("/api/overhaul/schedule")).json();
    if (json.ok) setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEditor = useCallback((r: Row) => {
    setEditing(r);
    setSaveError(null);
    // 자동배치된 일정은 계산값이라 미리 채우지 않는다 — 비워 두면 "자동 유지"라는 뜻이
    // 분명해지고, 실수로 자동배치 값을 지정 일정으로 굳혀 버리는 일이 없다.
    setDraft(
      r.sch.source === "excel"
        ? { start: r.sch.plannedStartStr, end: r.sch.plannedEndStr }
        : { start: "", end: "" },
    );
  }, []);

  /** 계획일정 저장. 둘 다 비우면 자동배치로 되돌아간다 */
  const savePlan = useCallback(
    async (next: { start: string; end: string }) => {
      if (!editing) return;
      if (next.start && next.end && next.end < next.start) {
        setSaveError("종료일이 시작일보다 앞설 수 없습니다.");
        return;
      }
      setBusy(true);
      setSaveError(null);
      try {
        const json = await (
          await fetch("/api/overhaul/tasks", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: editing.id,
              // 일정만 보낸다 — needs_review를 빼야 "확인 필요" 표시가 그대로 남는다
              patch: { plan_start: next.start, plan_end: next.end },
            }),
          })
        ).json();
        if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
        setEditing(null);
        await reload();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [editing, reload],
  );

  const total = data?.total ?? 1;
  const todayOff = data?.todayOff ?? 0;
  // 타임라인 폭을 재서, 화면이 좁으면 날짜 눈금을 줄이고 넓으면 늘린다(겹치지 않게)
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineW, setTimelineW] = useState(560);
  const hasChart = !!data && data.hasPeriod && data.rows.length > 0;
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTimelineW(el.clientWidth));
    ro.observe(el);
    setTimelineW(el.clientWidth);
    return () => ro.disconnect();
  }, [hasChart]);
  const ticks = useMemo(
    () => makeTicks(total, Math.max(3, Math.min(14, Math.floor(timelineW / TICK_MIN_PX)))),
    [total, timelineW],
  );
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
      // 분야 순서(기계 → 전기 → 제어)가 먼저, 같은 분야 안에서는 시작이 빠른 설비부터
      .sort((a, b) => fieldRank(a.field) - fieldRank(b.field) || a.minOff - b.minOff);
  }, [rows]);

  const pos = (off: number) => `${(off / total) * 100}%`;

  if (loading) {
    return <LoadingState />;
  }

  if (!data || data.rows.length === 0) {
    return (
      <>
        <ScreenHeader icon="calendar_view_week" title="공정표" desc="작업별 계획과 실적을 날짜 막대로 봅니다." bullets={[]} tone="soft" />
        <Card lift={false} className="p-0">
          <EmptyState
            icon="calendar_view_week"
            title="공정표를 생성할 작업이 없습니다"
            desc="먼저 엑셀 등록 탭에서 설계내역서를 올려 작업항목을 만드세요."
            action={
              <Link
                href="/overhaul/tasks/upload"
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
      <ScreenHeader
        icon="calendar_view_week"
        title="공정표"
        desc={
          data.hasPeriod
            ? `엑셀에 예정일이 있으면 그 일정을, 없으면 작업명 키워드로 자동 배치합니다. 달력 아이콘으로 직접 조정할 수 있습니다. (오버홀 ${startDate} ~ ${data.project.end_date} · 총 ${total}일)`
            : "계약기간이 설정되지 않아 전체 기간 대비 배치를 계산할 수 없습니다. 엑셀 등록에서 계약기간을 먼저 설정하세요."
        }
        bullets={[]}
        tone="soft"
        actionOnMobile
        action={
          data.hasPeriod ? (
            <div className="text-right">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">오늘 계획공정률</p>
              <p className="text-2xl font-black text-primary leading-tight">{data.plannedPct}%</p>
            </div>
          ) : undefined
        }
      />

      {historyPreview}

      {entryTaskId && (
        <EntryDialog
          taskId={entryTaskId}
          onClose={() => setEntryTaskId(null)}
          onChanged={() => void reload()}
        />
      )}

      {editing && (
        <Card className="p-card-padding border border-primary/30" lift={false}>
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <h2 className="text-title-sm text-on-surface flex items-center gap-2">
              <Icon name="edit_calendar" className="text-base text-primary" />
              계획일정 조정
            </h2>
            <span className="text-xs font-bold text-on-surface-variant">
              {editing.sch.source === "excel"
                ? "지금은 지정된 일정입니다"
                : `지금은 자동배치입니다 (${editing.sch.phase.label})`}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant mb-4">
            {editing.equipment} · <b className="text-on-surface">{editing.name}</b>
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-label-caps uppercase text-on-surface-variant">계획 시작일</span>
              <input
                type="date"
                className="input"
                value={draft.start}
                min={data.project.start_date ?? undefined}
                max={data.project.end_date ?? undefined}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-caps uppercase text-on-surface-variant">계획 종료일</span>
              <input
                type="date"
                className="input"
                value={draft.end}
                min={draft.start || data.project.start_date || undefined}
                max={data.project.end_date ?? undefined}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </label>
            <p className="sm:col-span-2 text-xs text-on-surface-variant self-end pb-1">
              날짜를 넣으면 그 일정이 자동배치를 이깁니다. 계약기간(
              {data.project.start_date} ~ {data.project.end_date}) 밖으로는 넣지 마세요 —
              막대가 양 끝에 붙어 표시됩니다.
            </p>
          </div>

          {saveError && (
            <p className="text-sm text-error flex items-center gap-2 mt-3">
              <Icon name="error" className="text-base" />
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button onClick={() => savePlan(draft)} disabled={busy}>
              <Icon name="save" className="text-base" />
              {busy ? "저장 중…" : "일정 지정"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              취소
            </Button>
            {editing.sch.source === "excel" && (
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={busy}
                onClick={() => savePlan({ start: "", end: "" })}
                title="지정된 일정을 지우고 작업명 키워드 자동배치로 되돌립니다"
              >
                <Icon name="auto_mode" className="text-base" />
                자동배치로 되돌리기
              </Button>
            )}
          </div>
        </Card>
      )}

      {!data.hasPeriod ? (
        <Card lift={false} className="p-card-padding">
          <div className="flex items-center gap-3">
            <Icon name="event_busy" className="text-status-warning-text" />
            <Link href="/overhaul/tasks/upload" className="text-primary text-sm font-semibold hover:underline">
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
              {/* PC(md 이상)는 칸 폭에 딱 맞춰 전체 일자가 한 화면에 들어오고, 폰은 최소 폭을 두고 옆으로 민다.
                  이름 칸 폭은 --lbl 한 곳에서 정한다(헤더·설비 행·작업 행·오늘 선이 같이 쓴다). */}
              <div className="min-w-[760px] md:min-w-0 [--lbl:196px] xl:[--lbl:220px] [--st:84px]">
                {/* 타임라인 헤더 */}
                <div className="flex items-stretch border-b border-border-subtle pb-2 mb-2">
                  <div className="w-[var(--lbl)] shrink-0 text-[12px] md:text-[13px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-end justify-center text-center">
                    설비 / 작업
                  </div>
                  <div className="w-[var(--st)] shrink-0 text-[12px] md:text-[13px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-end justify-center text-center">
                    현황
                  </div>
                  <div ref={timelineRef} className="relative flex-1 h-8" style={{ marginRight: END_GUTTER }}>
                    {ticks.map((d) => (
                      <div
                        key={d}
                        className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2"
                        style={{ left: pos(d) }}
                      >
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">
                          {startDate ? ymd(addDays(toDate(startDate), d)).slice(5) : ""}
                        </span>
                        <span className="text-xs text-on-surface-variant">D+{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 그룹/작업 행 */}
                <div className="relative">
                  {/* 오늘 기준선 */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-status-error/70 z-10 pointer-events-none"
                    style={{ left: `calc(var(--lbl) + var(--st) + (100% - var(--lbl) - var(--st) - ${END_GUTTER}px) * ${todayOff / total})` }}
                  >
                    <span className="absolute -top-0.5 -translate-x-1/2 text-xs font-bold text-status-error-text bg-surface px-1 rounded">
                      오늘
                    </span>
                  </div>

                  {groups.map((g, gi) => {
                    const isOpen = !collapsed[g.equip];
                    // 분야가 처음 나오는 설비 앞에 소제목 줄을 둔다(기계 → 전기 → 제어)
                    const fieldName = g.field ?? "미분류";
                    const startsField = gi === 0 || (groups[gi - 1].field ?? "미분류") !== fieldName;
                    const sameField = groups.filter((x) => (x.field ?? "미분류") === fieldName);
                    return (
                      <div key={g.equip}>
                        {startsField && (
                          <div className="flex items-center gap-2 pt-3 pb-1.5 mt-1 first:mt-0 border-b border-border-subtle/60">
                            <FieldChip field={fieldName} />
                            <span className="text-xs font-bold text-on-surface-variant">
                              {fieldName} 분야 · 설비 {sameField.length}개 · 작업{" "}
                              {sameField.reduce((n, x) => n + x.list.length, 0)}건
                            </span>
                          </div>
                        )}
                        {/* 설비 요약 행 */}
                        <div
                          className="flex items-center py-2 cursor-pointer hover:bg-surface-container-low rounded-lg transition-colors"
                          onClick={() => setCollapsed((c) => ({ ...c, [g.equip]: isOpen }))}
                        >
                          {/* 펼침 화살표는 칸 왼쪽 가장자리에 고정 — 설비 이름 길이와 상관없이 모든 설비 줄의
                              화살표가 한 세로줄로 늘어선다. 이름·칩은 그 오른쪽에서 가운데로 모은다 */}
                          <div className="relative w-[var(--lbl)] shrink-0 pl-7 pr-3 flex items-center justify-center gap-1.5">
                            <Icon
                              name={isOpen ? "expand_more" : "chevron_right"}
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-base text-on-surface-variant"
                            />
                            <FieldChip field={g.field ?? "미분류"} />
                            <span className="font-mono-data text-sm font-bold text-on-surface truncate">
                              {g.equip}
                            </span>
                            <span className="text-xs text-on-surface-variant">({g.list.length})</span>
                          </div>
                          <div className="w-[var(--st)] shrink-0 flex items-center justify-center">
                            {g.list.every((r) => r.actual >= 100) ? (
                              <StatusChip status="완료" />
                            ) : g.list.some((r) => r.behind && r.actual < 100) ? (
                              <StatusChip
                                status="지연"
                                label={`지연 ${g.list.filter((r) => r.behind && r.actual < 100).length}건`}
                                title="이 설비에서 계획보다 뒤처진 작업 수"
                              />
                            ) : null}
                          </div>
                          <div className="relative flex-1 h-6" style={{ marginRight: END_GUTTER }}>
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
                              className="absolute top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant"
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
                            // 계획 종료일이 며칠 지났는지 — 날짜를 다시 파싱하지 않고
                            // 서버가 준 오프셋끼리 빼서 구한다 (시간대 영향 없음)
                            const overdueDays = data.todayOff - r.sch.endOff;
                            return (
                              <div
                                key={r.id}
                                {...bindHistory(r.id)}
                                onClick={() => {
                                  hideHistory();
                                  setEntryTaskId(r.id);
                                }}
                                title="눌러서 실적 입력 · 올려 두면 정비 이력"
                                className={`flex items-center py-1.5 group cursor-pointer border-b border-border-subtle/40 last:border-0 ${
                                  editing?.id === r.id ? "bg-primary/5" : ""
                                }`}
                              >
                                <div className="w-[var(--lbl)] shrink-0 px-2 text-center">
                                  {/* 좁은 화면(xl 미만)에서는 이름이 한 줄을 다 쓰고 칩·수정 버튼이 아랫줄로 내려가
                                      이름이 세 글자만 보이고 잘리는 일이 없다 */}
                                  <div className="flex items-center justify-center gap-1.5 max-xl:flex-wrap">
                                    <p className="text-xs font-medium text-on-surface truncate min-w-0 max-xl:basis-full group-hover:text-primary transition-colors">
                                      {r.name}
                                    </p>
                                    <button
                                      title="계획일정 조정"
                                      onClick={(e) => {
                                        // 행 클릭(실적 입력 팝업)과 겹치지 않게 막는다
                                        e.stopPropagation();
                                        openEditor(r);
                                      }}
                                      className="shrink-0 w-10 h-10 -my-2 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
                                    >
                                      <Icon name="edit_calendar" className="text-sm" />
                                    </button>
                                  </div>
                                  <p className="text-xs text-on-surface-variant font-mono-data flex items-center justify-center gap-1 whitespace-nowrap">
                                    계획 {r.sch.plannedStartStr.slice(5)}~{r.sch.plannedEndStr.slice(5)}
                                    {r.sch.source === "excel" && (
                                      <span
                                        className="text-xs font-bold text-primary not-italic"
                                        title="엑셀에서 받았거나 손으로 지정한 일정"
                                      >
                                        지정
                                      </span>
                                    )}
                                  </p>
                                  <p
                                    className={`text-xs font-mono-data whitespace-nowrap truncate ${
                                      r.actualBar ? BAR_STYLE[barColor].text : "text-on-surface-variant"
                                    }`}
                                  >
                                    {r.actualBar?.real
                                      ? `실적 ${r.actualBar.startStr!.slice(5)}~${r.actualBar.endStr!.slice(5)}`
                                      : r.actual > 0
                                        ? `실적 ${r.actual}% · 일자 미입력`
                                        : "실적 미입력"}
                                  </p>
                                </div>
                                <div className="w-[var(--st)] shrink-0 flex items-center justify-center">
                                  {r.actual >= 100 ? (
                                    <StatusChip status="완료" />
                                  ) : r.behind ? (
                                    <StatusChip
                                      status="지연"
                                      label={overdueDays > 0 ? `지연 ${overdueDays}일` : "지연"}
                                      title={
                                        overdueDays > 0
                                          ? `계획 종료일(${r.sch.plannedEndStr})에서 ${overdueDays}일 지났습니다`
                                          : "오늘까지 나갔어야 할 계획 진도보다 뒤처졌습니다"
                                      }
                                    />
                                  ) : r.actual > 0 ? (
                                    <StatusChip status="진행중" />
                                  ) : (
                                    <StatusChip status="대기" />
                                  )}
                                </div>
                                <div className="relative flex-1 h-11" style={{ marginRight: END_GUTTER }}>
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
                                    className={`absolute top-[13px] text-xs font-bold ${BAR_STYLE[barColor].text}`}
                                    style={{ left: `calc(${pos(labelOff)} + 6px)` }}
                                  >
                                    {r.actual}%
                                  </span>
                                </div>
                              </div>
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
