import { NextResponse } from "next/server";
import { getOrCreateProject, listAllTasks, listEntryRanges } from "@/modules/overhaul/lib/repo";
import { taskProgress } from "@/modules/overhaul/lib/progress";
import {
  taskSchedule,
  plannedProgressOn,
  plannedOverall,
  scheduleDelayTasks,
  diffDays,
} from "@/modules/overhaul/lib/schedule";

export const dynamic = "force-dynamic";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const project = await getOrCreateProject();
    const tasks = await listAllTasks(project.id);
    const ranges = await listEntryRanges(project.id);
    const rangeByTask = new Map(ranges.map((r) => [r.task_id, r]));

    const hasPeriod = Boolean(project.start_date && project.end_date);
    const total = hasPeriod ? Math.max(1, diffDays(project.start_date!, project.end_date!)) : 0;
    const todayOff = hasPeriod ? clamp(diffDays(project.start_date!, today()), 0, total) : 0;

    const risk = hasPeriod ? scheduleDelayTasks(tasks, project, today()) : [];
    const riskIds = new Set(risk.map((t) => t.id));

    const rows = tasks.map((t) => {
      const sch = taskSchedule(t, project);
      const actual = taskProgress(t);
      const planned = plannedProgressOn(sch, today());
      const behind = riskIds.has(t.id);
      const status = actual >= 100 ? "완료" : behind ? "지연" : actual > 0 ? "진행중" : "대기";

      // 실적 바 — 실적 입력 이력의 날짜 범위(있으면), 없으면 진척률 비례(계획 시작 기준)
      const range = rangeByTask.get(t.id);
      let actualBar: {
        startOff: number;
        endOff: number;
        real: boolean;
        startStr?: string;
        endStr?: string;
      } | null = null;
      if (range) {
        const aS = clamp(diffDays(project.start_date!, range.min_date), 0, total);
        const aE = clamp(diffDays(project.start_date!, range.max_date), 0, total);
        actualBar = { startOff: aS, endOff: Math.max(aS, aE), real: true, startStr: range.min_date, endStr: range.max_date };
      } else if (actual > 0) {
        const span = Math.max(sch.endOff - sch.startOff, 1);
        actualBar = { startOff: sch.startOff, endOff: sch.startOff + Math.max(0.4, span * (actual / 100)), real: false };
      }

      return {
        id: t.id,
        name: t.name,
        unit: t.unit,
        field: t.field,
        equipment: t.equipment_type ?? "기타",
        planQty: t.plan_qty,
        doneQty: t.done_qty,
        sch,
        actual,
        planned,
        behind,
        status,
        actualBar,
      };
    });

    return NextResponse.json({
      ok: true,
      project,
      hasPeriod,
      total,
      todayOff,
      plannedPct: hasPeriod ? plannedOverall(tasks, project, today()) : 0,
      riskCount: risk.length,
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
