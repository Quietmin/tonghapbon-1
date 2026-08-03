// 공정표 자동 생성 (PRD 8장) — 작업명 키워드 → 오버홀 기간 내 계획일정 자동 배치
//
// 원본: legacy/plantsync/src/lib/schedule.js
// project.today(데모용 시뮬레이션 날짜)는 없앴다 — 항상 실제 오늘 날짜를 쓴다.
import { taskProgress, type ProgressTask } from "./progress";

// 로컬 날짜 파싱 (타임존 영향 없이)
export function toDate(s: string | Date): Date {
  if (s instanceof Date) return s;
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addDays(date: Date | string, n: number): Date {
  const d = new Date(toDate(date));
  d.setDate(d.getDate() + n);
  return d;
}
export function diffDays(a: string | Date, b: string | Date): number {
  return Math.round((+toDate(b) - +toDate(a)) / 86400000);
}

interface Phase {
  key: string;
  label: string;
  re?: RegExp;
  span: [number, number];
}

// 작업 유형별 배치 구간 (전체 기간 대비 시작~종료 비율) — PRD 8.3
const PHASES: Phase[] = [
  { key: "준비", label: "준비·가설·반입", re: /(준비|가설|반입|설치|양생|가설재)/, span: [0.0, 0.2] },
  { key: "분해", label: "분해·개방", re: /(분해|개방|해체|탈거|인출|철거)/, span: [0.05, 0.32] },
  { key: "점검", label: "점검·세정·청소", re: /(점검|세정|청소|세관|세척|점검\/세정)/, span: [0.15, 0.5] },
  {
    key: "검사",
    label: "검사·측정·진단",
    re: /(검사|측정|진단|시료|채취|교정|정정|시험성적|비파괴|ndt|pt|mt|ut)/i,
    span: [0.35, 0.62],
  },
  {
    key: "정비",
    label: "교체·정비",
    re: /(교체|정비|보수|용접|가공|수리|재생|오버홀|overhaul)/i,
    span: [0.4, 0.72],
  },
  { key: "조립", label: "조립·복구", re: /(조립|복구|재조립|보온|결선|복원|원복)/, span: [0.6, 0.85] },
  {
    key: "시험",
    label: "시험·시운전·확인",
    re: /(시험|시운전|확인|기동|성능|점화|통전|loop|루프)/i,
    span: [0.8, 1.0],
  },
];
const PARALLEL: Phase = { key: "병행", label: "전기·제어 병행", span: [0.1, 0.9] };
const DEFAULT_PHASE: Phase = { key: "기타", label: "일반 공정", span: [0.2, 0.85] };

export interface ScheduleTask {
  name: string;
  spec: string | null;
  field: string | null;
  plan_qty: number;
  done_qty: number;
  plan_start: string | null;
  plan_end: string | null;
}

export function phaseFor(task: Pick<ScheduleTask, "name" | "spec" | "field">): Phase {
  const text = `${task.name || ""} ${task.spec || ""}`;
  for (const ph of PHASES) {
    if (ph.re!.test(text)) {
      // 전기·제어의 단순 점검류는 전체 병행으로 넓게 배치
      if (ph.key === "점검" && (task.field === "전기" || task.field === "제어")) return PARALLEL;
      return ph;
    }
  }
  if (task.field === "전기" || task.field === "제어") return PARALLEL;
  return DEFAULT_PHASE;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface ScheduleProject {
  start_date: string | null;
  end_date: string | null;
}

export interface TaskSchedule {
  phase: { key: string; label: string };
  startOff: number;
  endOff: number;
  total: number;
  plannedStart: Date;
  plannedEnd: Date;
  plannedStartStr: string;
  plannedEndStr: string;
  source: "excel" | "auto" | "none";
}

/**
 * 단일 작업의 계획일정 산출
 * 1순위: 엑셀에 입력된 작업 예정일(task.plan_start/plan_end)
 * 2순위: 작업명 키워드 기반 자동 배치(PRD 8.3)
 */
export function taskSchedule(task: ScheduleTask, project: ScheduleProject): TaskSchedule {
  if (!project.start_date || !project.end_date) {
    // 계약기간이 없으면 계획일정 자체를 계산할 수 없다 — 호출부에서 hasPeriod로 분기해야 한다
    const now = new Date();
    return {
      phase: { key: "미정", label: "계약기간 미설정" },
      startOff: 0,
      endOff: 0,
      total: 1,
      plannedStart: now,
      plannedEnd: now,
      plannedStartStr: "",
      plannedEndStr: "",
      source: "none",
    };
  }

  const start = toDate(project.start_date);
  const total = Math.max(1, diffDays(project.start_date, project.end_date));

  if (task.plan_start) {
    const plannedStart = toDate(task.plan_start);
    const plannedEnd = task.plan_end ? toDate(task.plan_end) : plannedStart;
    const startOff = clamp(diffDays(project.start_date, task.plan_start), 0, total);
    const endOff = clamp(diffDays(project.start_date, task.plan_end || task.plan_start), startOff, total);
    return {
      phase: { key: "지정", label: "지정 일정" },
      startOff,
      endOff,
      total,
      plannedStart,
      plannedEnd,
      plannedStartStr: task.plan_start,
      plannedEndStr: task.plan_end || task.plan_start,
      source: "excel",
    };
  }

  const ph = phaseFor(task);
  const startOff = Math.round(ph.span[0] * total);
  const endOff = Math.max(startOff + 1, Math.min(total, Math.round(ph.span[1] * total)));
  const plannedStart = addDays(start, startOff);
  const plannedEnd = addDays(start, endOff);
  return {
    phase: ph,
    startOff,
    endOff,
    total,
    plannedStart,
    plannedEnd,
    plannedStartStr: ymd(plannedStart),
    plannedEndStr: ymd(plannedEnd),
    source: "auto",
  };
}

/** 특정 일자 기준 계획 진척률(%) — 계획 구간 내 선형 램프 */
export function plannedProgressOn(sch: TaskSchedule, dateStr: string): number {
  if (sch.source === "none") return 0;
  const d = toDate(dateStr);
  if (d <= sch.plannedStart) return 0;
  if (d >= sch.plannedEnd) return 100;
  const span = diffDays(sch.plannedStart, sch.plannedEnd);
  if (span <= 0) return 100;
  return Math.round((diffDays(sch.plannedStart, d) / span) * 1000) / 10;
}

/** 계획 대비 지연 여부 (미완료 & 실적이 계획보다 임계치 이상 뒤처짐) */
export function isBehind(
  task: ScheduleTask & ProgressTask,
  project: ScheduleProject,
  dateStr: string,
  threshold = 15,
): boolean {
  const p = taskProgress(task);
  if (p >= 100) return false;
  const sch = taskSchedule(task, project);
  return plannedProgressOn(sch, dateStr) - p >= threshold;
}

/** 계획 대비 지연 작업 목록 (일정 기준 — 엑셀 예정일 또는 자동배치) */
export function scheduleDelayTasks<T extends ScheduleTask & ProgressTask>(
  tasks: T[],
  project: ScheduleProject,
  dateStr: string,
  threshold = 15,
): T[] {
  return tasks.filter((t) => isBehind(t, project, dateStr, threshold));
}

/** 물량 가중 계획 공정률 (PRD 8.4) — 계획일정 기준. 대시보드의 선형 계획률보다 정밀하다. */
export function plannedOverall(tasks: ScheduleTask[], project: ScheduleProject, dateStr: string): number {
  if (!project.start_date || !project.end_date) return 0;
  let plan = 0;
  let expect = 0;
  for (const t of tasks) {
    const q = Number(t.plan_qty) || 0;
    plan += q;
    expect += (q * plannedProgressOn(taskSchedule(t, project), dateStr)) / 100;
  }
  if (plan <= 0) return 0;
  return Math.round((expect / plan) * 1000) / 10;
}

/** 예상 준공일 (현재 진행 속도 기준 단순 선형 추정) — 경영진 보고용 */
export function projectedFinish(
  overall: number,
  project: ScheduleProject,
  todayStr: string,
): { date: string | null; deltaDays: number | null } {
  if (!project.start_date || !project.end_date) return { date: null, deltaDays: null };
  const elapsed = Math.max(1, diffDays(project.start_date, todayStr));
  if (overall <= 0) return { date: null, deltaDays: null };
  const pace = overall / elapsed; // %/일
  const remainingDays = Math.ceil((100 - overall) / pace);
  const finish = addDays(toDate(todayStr), remainingDays);
  const deltaDays = diffDays(project.end_date, ymd(finish)); // +면 지연, -면 선행
  return { date: ymd(finish), deltaDays };
}
