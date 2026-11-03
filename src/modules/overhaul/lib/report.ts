// 보고서 데이터 집계 — 일일보고서(전일 실적·금일 계획)와 주간보고서(전주 실적·금주 계획).
//
// 원본: legacy/plantsync/src/pages/Reports.jsx의 useReportData() 훅.
// 두 보고서는 "지난 구간의 실적"과 "이번 구간의 계획"을 같은 규칙으로 뽑고, 구간만 다르다
// (일일 = 어제/오늘, 주간 = 지난주 월~일/이번 주 월~일).
//
// 기준일을 고를 수 있으므로 진행률도 기준일 시점 값으로 다시 계산한다 — 오늘 값으로
// 지난 날짜 보고서를 만들면 "그날 기준 공정률"이 아니게 된다.
import {
  taskProgress,
  progressByField,
  progressByEquipment,
  overallProgress,
  type EquipmentProgress,
} from "./progress";
import { taskSchedule, plannedProgressOn, plannedOverall, toDate, ymd, addDays } from "./schedule";
import type { OverhaulTask, OverhaulEntry, OverhaulProject } from "./repo";

export type ReportKind = "daily" | "weekly";

export interface DateRange {
  start: string;
  end: string;
}

/** 지난 구간 실적 한 줄 (작업 단위) */
export interface ResultRow {
  taskId: string;
  field: string | null;
  equipment: string;
  name: string;
  unit: string | null;
  /** 구간 동안 늘어난 완료수량 */
  qty: number;
  /** 구간 끝 시점 진행률 */
  progress: number;
  /** 구간 안에 적은 작업내용 (주간은 "10.27 …" 꼴로 날짜를 붙인다) */
  notes: string[];
}

/** 이번 구간 계획 한 줄 (작업 단위) */
export interface PlanRow {
  taskId: string;
  field: string | null;
  equipment: string;
  name: string;
  /** 기준일 시점 진행률 */
  actual: number;
  plannedStartStr: string;
  plannedEndStr: string;
  /** 구간 시작 전 마지막 실적에 적은 "익일 계획 / 조치계획" */
  plan: string | null;
}

export interface DelayedItem {
  taskId: string;
  field: string | null;
  name: string;
  equipment: string;
  actual: number;
  planned: number;
  delayReason: string | null;
  /** 지연 사유를 적은 날짜 */
  reasonDate: string | null;
  nextPlan: string | null;
}

export interface ReportSection {
  kind: ReportKind;
  /** 실적을 보는 지난 구간 (일일 = 전일, 주간 = 전주) */
  prev: DateRange;
  /** 계획을 보는 이번 구간 (일일 = 금일, 주간 = 금주) */
  cur: DateRange;
  results: ResultRow[];
  plans: PlanRow[];
  /** 지난 구간에 할 작업이었는데 실적을 한 번도 안 적은 작업 수 */
  missingCount: number;
}

export interface ReportData {
  baseDate: string;
  overall: number;
  planned: number;
  diff: number;
  byField: Record<string, number>;
  byEquip: EquipmentProgress[];
  delayed: DelayedItem[];
  withBefore: number;
  withAfter: number;
  completedEquipCount: number;
  daily: ReportSection;
  weekly: ReportSection;
}

const shortDate = (d: string) => d.slice(5).replace("-", ".");

/** 그 날짜가 속한 주의 월요일 */
function mondayOf(dateStr: string): string {
  const d = toDate(dateStr);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  return ymd(addDays(d, -dow));
}

/** 날짜 내림차순 목록에서 그 날짜까지(포함) 마지막으로 보고한 누적 */
function doneAsOf(list: OverhaulEntry[], dateStr: string): number | null {
  return list.find((e) => e.entry_date <= dateStr)?.done_qty ?? null;
}

/** entriesByTask의 각 배열은 entry_date 내림차순으로 정렬돼 있어야 한다 (repo.listAllEntriesForProject 순서) */
export function buildReportData(
  tasks: OverhaulTask[],
  entriesByTask: Map<string, OverhaulEntry[]>,
  project: OverhaulProject,
  baseDate: string,
  todayStr: string,
): ReportData {
  const hasPeriod = Boolean(project.start_date && project.end_date);
  const entriesOf = (t: OverhaulTask) => entriesByTask.get(t.id) ?? [];

  // 기준일 시점의 작업 — 지난 날짜면 그날까지의 실적으로 완료수량을 되돌린다.
  // 실적 기록이 아예 없는 작업(엑셀로 완료수량만 들어온 것)은 그대로 둔다.
  const asOf: OverhaulTask[] =
    baseDate >= todayStr
      ? tasks
      : tasks.map((t) => {
          const list = entriesOf(t);
          return list.length ? { ...t, done_qty: doneAsOf(list, baseDate) ?? 0 } : t;
        });

  const overall = overallProgress(asOf);
  const planned = hasPeriod ? plannedOverall(asOf, project, baseDate) : 0;
  const byField = progressByField(asOf);
  const byEquip = progressByEquipment(asOf).sort((a, b) => b.progress - a.progress);

  const enriched = asOf.map((t) => {
    const sch = taskSchedule(t, project);
    const actual = taskProgress(t);
    const pl = hasPeriod ? plannedProgressOn(sch, baseDate) : 0;
    return { task: t, sch, actual, planned: pl };
  });

  const overlaps = (r: (typeof enriched)[number], range: DateRange) =>
    hasPeriod && r.sch.plannedStartStr <= range.end && r.sch.plannedEndStr >= range.start;

  function section(kind: ReportKind, prev: DateRange, cur: DateRange): ReportSection {
    const results: ResultRow[] = [];
    let missingCount = 0;

    for (const r of enriched) {
      const t = r.task;
      const list = entriesOf(t);
      const inRange = list.filter((e) => e.entry_date >= prev.start && e.entry_date <= prev.end).reverse();
      const before = list.find((e) => e.entry_date < prev.start)?.done_qty ?? 0;
      const atEnd = doneAsOf(list, prev.end) ?? before;
      const qty = Math.max(0, atEnd - before);
      const notes = inRange
        .filter((e) => e.work_detail?.trim())
        .map((e) => (kind === "weekly" ? `${shortDate(e.entry_date)} ${e.work_detail!.trim()}` : e.work_detail!.trim()));

      if (qty > 0 || notes.length) {
        results.push({
          taskId: t.id,
          field: t.field,
          equipment: t.equipment_type ?? "기타",
          name: t.name,
          unit: t.unit,
          qty,
          progress: taskProgress({ ...t, done_qty: atEnd }),
          notes,
        });
      } else if (inRange.length === 0 && overlaps(r, prev) && taskProgress({ ...t, done_qty: before }) < 100) {
        missingCount++;
      }
    }

    const plans: PlanRow[] = enriched
      .filter((r) => r.actual < 100 && overlaps(r, cur))
      .sort((a, b) => a.sch.plannedStartStr.localeCompare(b.sch.plannedStartStr) || a.task.name.localeCompare(b.task.name))
      .map((r) => {
        const last = entriesOf(r.task).find((e) => e.entry_date < cur.start);
        return {
          taskId: r.task.id,
          field: r.task.field,
          equipment: r.task.equipment_type ?? "기타",
          name: r.task.name,
          actual: r.actual,
          plannedStartStr: r.sch.plannedStartStr,
          plannedEndStr: r.sch.plannedEndStr,
          plan: last?.next_plan?.trim() || null,
        };
      });

    const byOrder = (a: { field: string | null; equipment: string }, b: { field: string | null; equipment: string }) =>
      (a.field ?? "").localeCompare(b.field ?? "") || a.equipment.localeCompare(b.equipment);
    results.sort(byOrder);

    return { kind, prev, cur, results, plans, missingCount };
  }

  const yesterday = ymd(addDays(baseDate, -1));
  const monday = mondayOf(baseDate);
  const daily = section("daily", { start: yesterday, end: yesterday }, { start: baseDate, end: baseDate });
  const weekly = section(
    "weekly",
    { start: ymd(addDays(monday, -7)), end: ymd(addDays(monday, -1)) },
    { start: monday, end: ymd(addDays(monday, 6)) },
  );

  // 지연 = 계획보다 15%p 이상 뒤진 미완료 작업. 사유는 가장 최근에 "지연 없음"이 아닌 사유를 적은 기록에서 가져온다
  const delayed: DelayedItem[] = enriched
    .filter((r) => r.actual < 100 && r.planned - r.actual >= 15)
    .sort((a, b) => b.planned - b.actual - (a.planned - a.actual))
    .map((r) => {
      const list = entriesOf(r.task).filter((e) => e.entry_date <= baseDate);
      const withReason = list.find((e) => e.delay_reason && e.delay_reason !== "지연 없음");
      return {
        taskId: r.task.id,
        field: r.task.field,
        name: r.task.name,
        equipment: r.task.equipment_type ?? "기타",
        actual: r.actual,
        planned: r.planned,
        delayReason: withReason?.delay_reason ?? null,
        reasonDate: withReason?.entry_date ?? null,
        nextPlan: list[0]?.next_plan?.trim() || null,
      };
    });

  let withBefore = 0;
  let withAfter = 0;
  for (const t of tasks) {
    const photos = entriesOf(t)
      .filter((e) => e.entry_date <= baseDate)
      .flatMap((e) => e.photos ?? []);
    if (photos.some((p) => p.slot === "before")) withBefore++;
    if (photos.some((p) => p.slot === "after")) withAfter++;
  }

  return {
    baseDate,
    overall,
    planned,
    diff: Math.round((overall - planned) * 10) / 10,
    byField,
    byEquip,
    delayed,
    withBefore,
    withAfter,
    completedEquipCount: byEquip.filter((e) => e.progress >= 100).length,
    daily,
    weekly,
  };
}
