import { NextResponse } from "next/server";
import { getOrCreateProject, listAllTasks } from "@/modules/overhaul/lib/repo";
import {
  overallProgress,
  progressByField,
  progressByEquipment,
  scheduleInfo,
  taskProgress,
} from "@/modules/overhaul/lib/progress";
import { plannedOverall, scheduleDelayTasks } from "@/modules/overhaul/lib/schedule";

export const dynamic = "force-dynamic";
const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const project = await getOrCreateProject();
    const tasks = await listAllTasks(project.id);

    const sched = scheduleInfo(project);
    const overall = overallProgress(tasks);
    // 계획 공정률 · 지연 위험 — schedule.ts(공정표)의 계획일정 기준.
    // 엑셀 예정일이 있으면 그걸, 없으면 작업명 키워드 자동배치를 쓴다.
    // (기간 경과 비율만 보는 선형 계산보다 정밀하다 — 원본 Dashboard.jsx와 동일한 방식)
    const planned = plannedOverall(tasks, project, today());
    const risk = scheduleDelayTasks(tasks, project, today());

    return NextResponse.json({
      ok: true,
      project,
      hasPeriod: Boolean(project.start_date && project.end_date),
      overall,
      planned,
      sched: { elapsed: sched.elapsed, totalDays: sched.totalDays },
      byField: progressByField(tasks),
      equipment: progressByEquipment(tasks).sort((a, b) => b.count - a.count),
      riskCount: risk.length,
      riskFirst: risk[0]?.equipment_type ?? null,
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => taskProgress(t) >= 100).length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
