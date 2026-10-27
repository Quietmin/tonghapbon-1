import { cookies } from "next/headers";
import { query } from "@/shared/lib/db";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";
import { PROJECT_COOKIE } from "@/modules/overhaul/lib/activeProject";
import { listAllTasks, listProjects, type OverhaulProject } from "@/modules/overhaul/lib/repo";
import { overallProgress, progressByField, taskProgress } from "@/modules/overhaul/lib/progress";
import {
  diffDays,
  plannedOverall,
  plannedProgressOn,
  scheduleDelayTasks,
  taskSchedule,
} from "@/modules/overhaul/lib/schedule";

/**
 * 처음 화면 대시보드 데이터 — 선택한 지사의 가장 최근(또는 선택한) 회차 한 곳을 읽는다.
 *
 * 숫자는 설비관리 대시보드(/api/overhaul/dashboard)와 같은 함수(progress.ts · schedule.ts)로
 * 계산한다. 같은 회차를 두 화면이 서로 다른 숫자로 보여 주면 안 되기 때문이다.
 *
 * 오버홀 화면과 달리 getOrCreateProject 를 쓰지 않는다 — 첫 화면을 열었다고 회차 행이
 * 새로 생기면 안 되므로, 회차가 없으면 없는 대로 "아직 없음"을 돌려준다.
 */

export interface RiskItem {
  id: string;
  name: string;
  equipment: string | null;
  field: string | null;
  progress: number;
  /** 계획 종료일이 지난 일수 (0 이면 아직 종료 전 — 계획보다 뒤처진 경우) */
  overdueDays: number;
  /** 계획 진척 − 실적 진척 (%p) */
  gap: number;
}

export interface RecentEntry {
  date: string;
  taskName: string;
  equipment: string | null;
  field: string | null;
  doneQty: number;
  unit: string | null;
  /** 그 작업의 현재 누계 공정률 */
  progress: number;
}

export interface DashboardStats {
  hasPeriod: boolean;
  overall: number;
  planned: number;
  taskCount: number;
  doneCount: number;
  inProgressCount: number;
  byField: Record<string, number>;
  riskCount: number;
  risk: RiskItem[];
  /** 종료일까지 남은 일수 (음수면 지남). 기간이 없으면 null */
  daysLeft: number | null;
}

export type HomeDashboard =
  | { kind: "no-branch" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      branch: string;
      project: OverhaulProject | null;
      stats: DashboardStats | null;
      equipmentCount: number;
      deviceCount: number;
      recent: RecentEntry[];
    };

// 설비관리 대시보드 API 와 같은 기준일(UTC 날짜)을 쓴다 — 숫자가 어긋나지 않게
const today = () => new Date().toISOString().slice(0, 10);

const num = (v: unknown) => Number(v) || 0;

export async function getHomeDashboard(): Promise<HomeDashboard> {
  try {
    const branch = await resolveBranch();
    if (!branch) return { kind: "no-branch" };

    const projects = await listProjects(branch);
    const cookieId = (await cookies()).get(PROJECT_COOKIE)?.value;
    const project = projects.find((p) => p.id === cookieId) ?? projects[0] ?? null;

    const [eq, dev] = await Promise.all([
      query<{ c: number }>(`select count(*)::int as c from equipment where branch = $1`, [branch]),
      query<{ c: number }>(`select count(*)::int as c from device where branch = $1`, [branch]),
    ]);
    const equipmentCount = eq[0]?.c ?? 0;
    const deviceCount = dev[0]?.c ?? 0;

    if (!project) {
      return { kind: "ready", branch, project: null, stats: null, equipmentCount, deviceCount, recent: [] };
    }

    const tasks = await listAllTasks(project.id);
    const day = today();
    const hasPeriod = Boolean(project.start_date && project.end_date);

    const delayed = scheduleDelayTasks(tasks, project, day);
    const risk: RiskItem[] = delayed
      .map((t) => {
        const sch = taskSchedule(t, project);
        const progress = taskProgress(t);
        const overdue = sch.source !== "none" && day > sch.plannedEndStr ? diffDays(sch.plannedEndStr, day) : 0;
        return {
          id: t.id,
          name: t.name,
          equipment: t.equipment_type,
          field: t.field,
          progress,
          overdueDays: overdue,
          gap: Math.round((plannedProgressOn(sch, day) - progress) * 10) / 10,
        };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays || b.gap - a.gap);

    const doneCount = tasks.filter((t) => taskProgress(t) >= 100).length;
    const inProgressCount = tasks.filter((t) => {
      const p = taskProgress(t);
      return p > 0 && p < 100;
    }).length;

    const stats: DashboardStats = {
      hasPeriod,
      overall: overallProgress(tasks),
      planned: plannedOverall(tasks, project, day),
      taskCount: tasks.length,
      doneCount,
      inProgressCount,
      byField: progressByField(tasks),
      riskCount: risk.length,
      risk: risk.slice(0, 5),
      daysLeft: hasPeriod ? diffDays(day, project.end_date as string) : null,
    };

    const recentRows = await query<{
      entry_date: string;
      entry_qty: string | number;
      name: string;
      equipment_type: string | null;
      field: string | null;
      unit: string | null;
      plan_qty: string | number;
      task_done: string | number;
    }>(
      `select o.entry_date::text as entry_date,
              o.done_qty        as entry_qty,
              t.name, t.equipment_type, t.field, t.unit,
              t.plan_qty,
              t.done_qty        as task_done
         from overhaul_entry o
         join overhaul_task t on t.id = o.task_id
        where t.project_id = $1
        order by o.entry_date desc, o.updated_at desc
        limit 6`,
      [project.id],
    );
    const recent: RecentEntry[] = recentRows.map((r) => ({
      date: r.entry_date,
      taskName: r.name,
      equipment: r.equipment_type,
      field: r.field,
      doneQty: num(r.entry_qty),
      unit: r.unit,
      progress: taskProgress({
        plan_qty: num(r.plan_qty),
        done_qty: num(r.task_done),
        field: r.field,
        equipment_type: r.equipment_type,
      }),
    }));

    return { kind: "ready", branch, project, stats, equipmentCount, deviceCount, recent };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
