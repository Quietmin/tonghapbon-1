// 공정률 산정 (PRD 7장) — 물량 기준
//
// 원본: legacy/plantsync/src/lib/progress.js
// 계산식은 그대로 두되, 입력을 DB 컬럼명(snake_case)에 맞췄다.
// 원본은 브라우저 상태(planQty/doneQty/equipment)를 직접 받았지만
// 이제는 overhaul_task 행이 그대로 흘러들어오기 때문이다.

export const FIELDS = ["기계", "전기", "제어"] as const;

export interface ProgressTask {
  plan_qty: number;
  done_qty: number;
  field: string | null;
  equipment_type: string | null;
}

export interface Project {
  start_date: string | null;
  end_date: string | null;
}

/** 작업별 공정률 = 실제 완료수량 / 계획수량 × 100 */
export function taskProgress(task: ProgressTask): number {
  const plan = Number(task.plan_qty) || 0;
  const done = Number(task.done_qty) || 0;
  if (plan <= 0) return 0;
  return Math.min(100, Math.round((done / plan) * 1000) / 10);
}

/** 물량 가중 공정률 (그룹): Σ완료 / Σ계획 × 100 */
export function weightedProgress(tasks: ProgressTask[]): number {
  let plan = 0;
  let done = 0;
  for (const t of tasks) {
    plan += Number(t.plan_qty) || 0;
    done += Math.min(Number(t.done_qty) || 0, Number(t.plan_qty) || 0);
  }
  if (plan <= 0) return 0;
  return Math.round((done / plan) * 1000) / 10;
}

export function overallProgress(tasks: ProgressTask[]): number {
  return weightedProgress(tasks);
}

export function progressByField(tasks: ProgressTask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FIELDS) {
    out[f] = weightedProgress(tasks.filter((t) => t.field === f));
  }
  return out;
}

export interface EquipmentProgress {
  equipment: string;
  field: string | null;
  count: number;
  progress: number;
}

export function progressByEquipment(tasks: ProgressTask[]): EquipmentProgress[] {
  const groups: Record<string, ProgressTask[]> = {};
  for (const t of tasks) {
    const key = t.equipment_type || "기타";
    (groups[key] ||= []).push(t);
  }
  return Object.entries(groups).map(([equipment, list]) => ({
    equipment,
    field: list[0].field,
    count: list.length,
    progress: weightedProgress(list),
  }));
}

export interface ScheduleInfo {
  totalDays: number;
  elapsed: number;
  /** 계획 공정률(선형) — 기간 경과 비율 */
  expected: number;
  start: Date | null;
  end: Date | null;
  today: Date;
}

/** 오버홀 기간 경과. 계약기간이 아직 없으면 expected는 0으로 둔다. */
export function scheduleInfo(project: Project, todayStr?: string): ScheduleInfo {
  const today = todayStr ? new Date(todayStr) : new Date();
  if (!project.start_date || !project.end_date) {
    return { totalDays: 0, elapsed: 0, expected: 0, start: null, end: null, today };
  }
  const start = new Date(project.start_date);
  const end = new Date(project.end_date);
  const totalDays = Math.max(1, Math.round((+end - +start) / 86400000));
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((+today - +start) / 86400000)));
  const expected = Math.round((elapsed / totalDays) * 1000) / 10;
  return { totalDays, elapsed, expected, start, end, today };
}

export function taskStatus(task: ProgressTask): "완료" | "진행중" | "대기" {
  const p = taskProgress(task);
  if (p >= 100) return "완료";
  if (p > 0) return "진행중";
  return "대기";
}

// 지연 위험 판정은 여기 없다. schedule.ts의 scheduleDelayTasks가 유일한 구현이다.
// (예전엔 "기간 경과 비율" 기준 함수가 여기에도 있었지만 아무도 부르지 않았고,
//  임계치가 두 곳에 흩어져 한쪽만 고치는 사고가 나기 쉬웠다)

export function fieldColor(field: string | null): "primary" | "success" | "error" | "info" {
  if (field === "기계") return "primary";
  if (field === "전기") return "success";
  if (field === "제어") return "error";
  return "info";
}
