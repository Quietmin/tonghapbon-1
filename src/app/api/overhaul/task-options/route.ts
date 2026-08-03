import { NextResponse } from "next/server";
import { getOrCreateProject, listTaskOptions } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

/** 실적 입력 화면의 작업 선택 드롭다운용 — 가벼운 목록만 */
export async function GET() {
  const project = await getOrCreateProject();
  const options = await listTaskOptions(project.id);
  return NextResponse.json({ ok: true, options });
}
