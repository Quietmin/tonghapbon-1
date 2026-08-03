import { NextResponse } from "next/server";
import { getOrCreateProject, listSources, deleteSource } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

/** 업로드 이력 목록. 엑셀 원본은 보관하지 않고 파일명·건수만 남는다. */
export async function GET() {
  const project = await getOrCreateProject();
  const sources = await listSources(project.id);
  return NextResponse.json({ ok: true, project, sources });
}

/** 업로드 파일 단위 되돌리기 — 그 파일에서 나온 작업항목도 함께 지워진다 */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });
  const removed = await deleteSource(id);
  return NextResponse.json({ ok: true, removed });
}
