import { NextResponse } from "next/server";
import { getOrCreateProject, listAllTasks } from "@/modules/overhaul/lib/repo";
import {
  overallProgress,
  progressByField,
  progressByEquipment,
  scheduleInfo,
  taskProgress,
  delayRiskTasks,
} from "@/modules/overhaul/lib/progress";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const project = await getOrCreateProject();
    const tasks = await listAllTasks(project.id);

    const sched = scheduleInfo(project);
    const overall = overallProgress(tasks);
    // 계획 공정률: 지금은 기간 경과 비율(선형). 엑셀 예정일 기반의 정밀한 계획률은
    // schedule.ts(공정표)를 이식할 때 이 자리를 대체한다.
    const planned = sched.expected;
    const risk = delayRiskTasks(tasks, planned);

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
