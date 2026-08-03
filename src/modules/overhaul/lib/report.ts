// 보고서 데이터 집계 — 일일보고서·경영진 요약 보고서가 함께 쓴다.
//
// 원본: legacy/plantsync/src/pages/Reports.jsx의 useReportData() 훅.
// 원본은 브라우저 메모리의 task.entries 배열을 직접 훑었지만, 여기서는
// DB에서 한 번에 읽어온 (작업별 날짜 내림차순) 이력 목록을 받아 같은 계산을 한다.
import {
  taskProgress,
  progressByField,
  progressByEquipment,
  overallProgress,
  type EquipmentProgress,
} from "./progress";
import { taskSchedule, plannedProgressOn, plannedOverall, projectedFinish, toDate, ymd, addDays } from "./schedule";
import type { OverhaulTask, OverhaulEntry, OverhaulProject } from "./repo";

export interface TodayResult {
  taskId: string;
  name: string;
  equipment: string;
  unit: string | null;
  doneToday: number;
  notes: string | null;
}

export interface UpcomingItem {
  taskId: string;
  name: string;
  equipment: string;
  field: string | null;
  actual: number;
  plannedStartStr: string;
  plannedEndStr: string;
}

export interface DelayedItem {
  taskId: string;
  name: string;
  equipment: string;
  actual: number;
  planned: number;
  delayReason: string | null;
  nextPlan: string | null;
}

export interface ReportData {
  today: string;
  tomorrow: string;
  overall: number;
  planned: number;
  diff: number;
  byField: Record<string, number>;
  byEquip: EquipmentProgress[];
  todayResults: TodayResult[];
  upcoming: UpcomingItem[];
  delayed: DelayedItem[];
  missingCount: number;
  withBefore: number;
  withAfter: number;
  completedEquipCount: number;
  finish: { date: string | null; deltaDays: number | null };
}

/** entriesByTask의 각 배열은 entry_date 내림차순으로 정렬돼 있어야 한다 (repo.listAllEntriesForProject 순서) */
export function buildReportData(
  tasks: OverhaulTask[],
  entriesByTask: Map<string, OverhaulEntry[]>,
  project: OverhaulProject,
  todayStr: string,
): ReportData {
  const hasPeriod = Boolean(project.start_date && project.end_date);
  const tomorrow = ymd(addDays(toDate(todayStr), 1));
  const overall = overallProgress(tasks);
  const planned = hasPeriod ? plannedOverall(tasks, project, todayStr) : 0;
  const byField = progressByField(tasks);
  const byEquip = progressByEquipment(tasks).sort((a, b) => b.progress - a.progress);

  const enriched = tasks.map((t) => {
    const sch = taskSchedule(t, project);
    const actual = taskProgress(t);
    const pl = plannedProgressOn(sch, todayStr);
    return { task: t, sch, actual, planned: pl, behind: actual < 100 && pl - actual >= 15 };
  });

  const todayResults: TodayResult[] = [];
  let missingCount = 0;
  let withBefore = 0;
  let withAfter = 0;

  for (const t of tasks) {
    const list = entriesByTask.get(t.id) ?? []; // entry_date 내림차순
    const latest = list[0] ?? null;
    if (latest?.photo_before) withBefore++;
    if (latest?.photo_after) withAfter++;

    const todaysEntry = list.find((e) => e.entry_date === todayStr);
    if (todaysEntry) {
      const prior = list
        .filter((e) => e.entry_date < todayStr)
        .reduce((max, e) => Math.max(max, e.done_qty), 0);
      const doneToday = Math.max(0, todaysEntry.done_qty - prior);
      if (doneToday > 0) {
        todayResults.push({
          taskId: t.id,
          name: t.name,
          equipment: t.equipment_type ?? "기타",
          unit: t.unit,
          doneToday,
          notes: todaysEntry.work_detail,
        });
      }
    }
    if (taskProgress(t) < 100 && !todaysEntry) missingCount++;
  }

  const upcoming: UpcomingItem[] = hasPeriod
    ? enriched
        .filter(
          (r) =>
            r.actual < 100 && r.sch.plannedStartStr <= tomorrow && r.sch.plannedEndStr >= tomorrow,
        )
        .sort((a, b) => (a.sch.plannedStartStr < b.sch.plannedStartStr ? -1 : 1))
        .map((r) => ({
          taskId: r.task.id,
          name: r.task.name,
          equipment: r.task.equipment_type ?? "기타",
          field: r.task.field,
          actual: r.actual,
          plannedStartStr: r.sch.plannedStartStr,
          plannedEndStr: r.sch.plannedEndStr,
        }))
    : [];

  const delayed: DelayedItem[] = enriched
    .filter((r) => r.behind)
    .sort((a, b) => b.planned - a.planned - (b.actual - a.actual))
    .map((r) => {
      const latest = (entriesByTask.get(r.task.id) ?? [])[0] ?? null;
      return {
        taskId: r.task.id,
        name: r.task.name,
        equipment: r.task.equipment_type ?? "기타",
        actual: r.actual,
        planned: r.planned,
        delayReason:
          latest?.delay_reason && latest.delay_reason !== "지연 없음" ? latest.delay_reason : null,
        nextPlan: latest?.next_plan ?? null,
      };
    });

  const completedEquipCount = byEquip.filter((e) => e.progress >= 100).length;
  const finish = projectedFinish(overall, project, todayStr);

  return {
    today: todayStr,
    tomorrow,
    overall,
    planned,
    diff: Math.round((overall - planned) * 10) / 10,
    byField,
    byEquip,
    todayResults,
    upcoming,
    delayed,
    missingCount,
    withBefore,
    withAfter,
    completedEquipCount,
    finish,
  };
}
