import { NextResponse } from "next/server";
import { getOrCreateProject, listTasks, listAllTasks } from "@/modules/overhaul/lib/repo";
import { overallProgress, scheduleInfo } from "@/modules/overhaul/lib/progress";
import { scheduleDelayTasks } from "@/modules/overhaul/lib/schedule";

export const dynamic = "force-dynamic";
const today = () => new Date().toISOString().slice(0, 10);

const PAGE_SIZE = 12;

/**
 * 작업 목록 + 화면 상단/하단 요약 지표.
 *
 * 요약은 필터와 무관하게 전체 작업 기준으로 낸다 (원본과 같은 동작).
 * 그래서 목록은 페이지 단위로, 요약은 전체를 한 번 더 읽는다.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const field = sp.get("field") ?? "";
    const equipment = sp.get("equipment") ?? "";
    const q = sp.get("q") ?? "";

    const project = await getOrCreateProject();

    const { rows, total } = await listTasks(project.id, {
      field: field && field !== "전체" ? field : undefined,
      equipmentType: equipment && equipment !== "전체" ? equipment : undefined,
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });

    const all = await listAllTasks(project.id);
    const sched = scheduleInfo(project);
    // 지연 판정은 계획일정(schedule.ts) 기준 — 원본 TaskManagement.jsx와 동일하게
    // 기간 경과 비율이 아니라 엑셀 예정일/자동배치 기준으로 뒤처짐을 본다.
    const risk = scheduleDelayTasks(all, project, today());
    const riskIds = new Set(risk.map((t) => t.id));

    return NextResponse.json({
      ok: true,
      project,
      rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      riskIds: [...riskIds],
      equipmentOptions: [...new Set(all.map((t) => t.equipment_type).filter(Boolean))].sort(),
      summary: {
        taskCount: all.length,
        overall: overallProgress(all),
        riskCount: risk.length,
        personnel: new Set(all.map((t) => t.assignee).filter(Boolean)).size,
        remainingDays: Math.max(0, sched.totalDays - sched.elapsed),
        endDate: project.end_date,
        expected: sched.expected,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
