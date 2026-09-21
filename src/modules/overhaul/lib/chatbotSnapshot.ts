// 따소미 챗봇(조회 전용)용 요약 스냅샷 — 서버에서만 호출한다.
//
// 원본: AI-Do-Sample/src/lib/chatbotData.js (getChatbotSnapshot)
// 원본은 브라우저 IndexedDB 스토어(state.tasks/state.project)를 동기로 읽었지만,
// 이 저장소는 데이터가 Postgres에 있으므로 repo.ts를 거쳐 비동기로 읽는다.
// 공정률·계획대비·지연위험 계산은 새로 만들지 않고 progress.ts·schedule.ts를 그대로 재사용한다.
import {
  getOrCreateProject,
  listAllTasks,
  listSources,
  listAllEntriesForProject,
  type OverhaulTask,
} from "./repo";
import { overallProgress, progressByField, progressByEquipment, scheduleInfo, taskProgress, taskStatus } from "./progress";
import { plannedOverall, scheduleDelayTasks } from "./schedule";

const today = () => new Date().toISOString().slice(0, 10);

// 유효한 계획수량(0 초과, 유한수)만 인정 — 하나도 없으면 "0%"가 아니라 "계산 불가"로 구분
function hasAnyValidPlanQty(tasks: OverhaulTask[]): boolean {
  return tasks.some((t) => Number.isFinite(t.plan_qty) && t.plan_qty > 0);
}

// 음수/비정상 수량 탐지 — 값을 고치거나 걸러내지 않고 그대로 경고 목록에만 남긴다
export interface QuantityAnomaly {
  taskId: string;
  equipment: string | null;
  field: string | null;
  name: string;
  issue: "invalid_planQty" | "invalid_doneQty" | "doneQty_exceeds_planQty";
}

function findQuantityAnomalies(tasks: OverhaulTask[]): QuantityAnomaly[] {
  const anomalies: QuantityAnomaly[] = [];
  for (const t of tasks) {
    const plan = t.plan_qty;
    const done = t.done_qty;
    const invalidPlan = !Number.isFinite(plan) || plan < 0;
    const invalidDone = !Number.isFinite(done) || done < 0;
    if (invalidPlan) {
      anomalies.push({ taskId: t.id, equipment: t.equipment_type, field: t.field, name: t.name, issue: "invalid_planQty" });
    }
    if (invalidDone) {
      anomalies.push({ taskId: t.id, equipment: t.equipment_type, field: t.field, name: t.name, issue: "invalid_doneQty" });
    }
    if (!invalidPlan && !invalidDone && done > plan) {
      anomalies.push({ taskId: t.id, equipment: t.equipment_type, field: t.field, name: t.name, issue: "doneQty_exceeds_planQty" });
    }
  }
  return anomalies;
}

export interface EquipmentSnapshot {
  equipment: string;
  field: string | null;
  count: number;
  progress: number;
}

export interface DelayRiskSnapshot {
  taskId: string;
  equipment: string;
  field: string | null;
  name: string;
  progress: number;
}

export interface ChatbotSnapshot {
  queriedAt: string;
  /** 새 저장소엔 데모 모드가 없다 — 작업이 하나도 없으면 empty, 있으면 uploaded */
  dataSource: "uploaded" | "empty";
  planBaselineDate: string;
  lastEntryDate: string | null;
  project: { name: string; plant: string | null; unit: string | null; startDate: string | null; endDate: string | null } | null;
  counts: { total: number; done: number; inProgress: number; waiting: number };
  canCompute: boolean;
  overall: number | null;
  plannedOverall: number | null;
  byField: Record<string, number> | null;
  byEquipment: EquipmentSnapshot[] | null;
  delayRiskCount: number | null;
  delayRiskTasks: DelayRiskSnapshot[] | null;
  scheduleInfo: { totalDays: number; elapsed: number; expected: number } | null;
  anomalies: QuantityAnomaly[];
  hasAnomalies: boolean;
}

/**
 * 챗봇이 답변에 쓸 조회 전용 요약 스냅샷.
 * DB를 읽기만 하고, 전체·분야별·설비별 공정률과 계획/지연 판정은
 * progress.ts·schedule.ts의 기존 함수를 그대로 재사용한다(새 계산식을 만들지 않음).
 */
export async function getChatbotSnapshot(): Promise<ChatbotSnapshot> {
  const queriedAt = new Date().toISOString();
  const project = await getOrCreateProject();
  const [tasks, sources, entries] = await Promise.all([
    listAllTasks(project.id),
    listSources(project.id),
    listAllEntriesForProject(project.id),
  ]);

  const dataSource: ChatbotSnapshot["dataSource"] = tasks.length === 0 ? "empty" : "uploaded";
  const anomalies = findQuantityAnomalies(tasks);
  const lastEntryDate = entries.reduce<string | null>(
    (last, e) => (last === null || e.entry_date > last ? e.entry_date : last),
    null,
  );
  const planBaselineDate = today();

  const counts = { total: tasks.length, done: 0, inProgress: 0, waiting: 0 };
  for (const t of tasks) {
    const status = taskStatus(t);
    if (status === "완료") counts.done += 1;
    else if (status === "진행중") counts.inProgress += 1;
    else counts.waiting += 1;
  }

  // 작업 자체가 없거나, 있어도 유효한 계획수량이 하나도 없으면 "0%"와 구분되는 계산 불가 상태
  const canCompute = tasks.length > 0 && hasAnyValidPlanQty(tasks);

  let overall: number | null = null;
  let byField: Record<string, number> | null = null;
  let byEquipment: EquipmentSnapshot[] | null = null;
  if (canCompute) {
    overall = overallProgress(tasks);
    byField = progressByField(tasks);
    byEquipment = progressByEquipment(tasks);
  }

  let planned: number | null = null;
  let delayRiskTasks: DelayRiskSnapshot[] | null = null;
  let sched: { totalDays: number; elapsed: number; expected: number } | null = null;
  if (canCompute && project.start_date && project.end_date) {
    planned = plannedOverall(tasks, project, planBaselineDate);
    const risk = scheduleDelayTasks(tasks, project, planBaselineDate);
    delayRiskTasks = risk.map((t) => ({
      taskId: t.id,
      equipment: t.equipment_type ?? "기타",
      field: t.field,
      name: t.name,
      progress: taskProgress(t),
    }));
    const info = scheduleInfo(project, planBaselineDate);
    sched = { totalDays: info.totalDays, elapsed: info.elapsed, expected: info.expected };
  }

  return {
    queriedAt,
    dataSource,
    planBaselineDate,
    lastEntryDate,
    project: {
      name: project.name,
      plant: project.plant,
      unit: project.unit,
      startDate: project.start_date,
      endDate: project.end_date,
    },
    counts,
    canCompute,
    overall,
    plannedOverall: planned,
    byField,
    byEquipment,
    delayRiskCount: delayRiskTasks ? delayRiskTasks.length : null,
    delayRiskTasks,
    scheduleInfo: sched,
    anomalies,
    hasAnomalies: anomalies.length > 0,
  };
}
