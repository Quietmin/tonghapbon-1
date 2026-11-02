import { NextResponse } from "next/server";
import { listIssuePhotoIds } from "@/modules/status/lib/repo";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — 이슈에 붙은 사진 id 목록. 현황 팝업이 열릴 때만 부른다(목록 응답은 가볍게 두려고 사진을 싣지 않는다).
 * 사진 테이블이 아직 없는 DB 에서도 빈 목록으로 답한다.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: true, ids: [] });
  return NextResponse.json({ ok: true, ids: await listIssuePhotoIds(id) });
}
