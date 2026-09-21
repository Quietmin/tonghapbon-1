import { NextResponse } from "next/server";
import {
  listTasks,
  listAllTasks,
  createTask,
  updateTask,
  deleteTask,
  getTask,
  type TaskPatch,
} from "@/modules/overhaul/lib/repo";
import { resolveProjectFromRequest } from "@/modules/overhaul/lib/activeProject";
import { overallProgress, scheduleInfo } from "@/modules/overhaul/lib/progress";
import { scheduleDelayTasks } from "@/modules/overhaul/lib/schedule";

export const dynamic = "force-dynamic";
const today = () => new Date().toISOString().slice(0, 10);

const PAGE_SIZE = 12;

const fail = (msg: string, status = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status });

const boom = (e: unknown) =>
  NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : String(e) },
    { status: 500 },
  );

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
    const needsReview = sp.get("needsReview") === "1";

    const project = await resolveProjectFromRequest(req);

    const { rows, total } = await listTasks(project.id, {
      field: field && field !== "전체" ? field : undefined,
      equipmentType: equipment && equipment !== "전체" ? equipment : undefined,
      q: q.trim() || undefined,
      needsReview: needsReview || undefined,
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
        reviewCount: all.filter((t) => t.needs_review).length,
        remainingDays: Math.max(0, sched.totalDays - sched.elapsed),
        endDate: project.end_date,
        expected: sched.expected,
      },
    });
  } catch (e) {
    return boom(e);
  }
}

/** 엑셀에 없던 작업을 손으로 추가한다 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TaskPatch & { name?: string };
    if (!body.name?.trim()) return fail("작업명을 입력하세요.");

    const project = await resolveProjectFromRequest(req);
    const created = await createTask(project.id, { ...body, name: body.name });
    return NextResponse.json({ ok: true, task: await getTask(created.id) });
  } catch (e) {
    return boom(e);
  }
}

/**
 * 작업항목 수정. body: { id, patch }
 *
 * patch에 담아 보낸 필드만 바뀐다. "확인 필요" 표시를 뗄지도 보내는 쪽이 정한다 —
 * 전체 편집 폼은 needs_review:false를 함께 보내고(확인을 마쳤다는 뜻),
 * 공정표에서 일정만 고칠 때는 안 보내서 표시를 그대로 둔다.
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; patch?: TaskPatch };
    if (!body.id) return fail("id가 없습니다.");
    if (!body.patch || !Object.keys(body.patch).length) return fail("고칠 내용이 없습니다.");

    await updateTask(body.id, body.patch);
    const task = await getTask(body.id);
    if (!task) return fail("작업을 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return boom(e);
  }
}

/** ?id=... 작업 한 건 삭제 — 딸린 실적 이력도 함께 지워진다 */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("id가 없습니다.");
    const removed = await deleteTask(id);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return boom(e);
  }
}
