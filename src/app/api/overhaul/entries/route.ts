import { NextResponse } from "next/server";
import { getTask, listEntries, upsertEntry, deleteEntry } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

/** GET ?taskId=... → 해당 작업 정보 + 날짜별 실적 이력 전체 */
export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ ok: false, error: "taskId가 없습니다." }, { status: 400 });

  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ ok: false, error: "작업을 찾을 수 없습니다." }, { status: 404 });

  const entries = await listEntries(taskId);
  return NextResponse.json({ ok: true, task, entries });
}

/** 날짜별 실적 저장 (있으면 덮어씀) */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, date, cumulative } = body;
    if (!taskId || !date) {
      return NextResponse.json({ ok: false, error: "taskId·date가 필요합니다." }, { status: 400 });
    }
    await upsertEntry({
      taskId,
      date,
      cumulative: Number(cumulative) || 0,
      workDetail: body.workDetail,
      delayReason: body.delayReason,
      nextPlan: body.nextPlan,
      photoBefore: body.photoBefore,
      photoAfter: body.photoAfter,
    });
    const task = await getTask(taskId);
    const entries = await listEntries(taskId);
    return NextResponse.json({ ok: true, task, entries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** ?taskId=...&date=... 이력 한 건 삭제 */
export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const taskId = sp.get("taskId");
  const date = sp.get("date");
  if (!taskId || !date) {
    return NextResponse.json({ ok: false, error: "taskId·date가 필요합니다." }, { status: 400 });
  }
  await deleteEntry(taskId, date);
  const task = await getTask(taskId);
  const entries = await listEntries(taskId);
  return NextResponse.json({ ok: true, task, entries });
}
