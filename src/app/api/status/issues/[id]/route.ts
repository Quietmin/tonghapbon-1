import { NextResponse } from "next/server";
import { isStatus } from "@/modules/status/lib/constants";
import { updateIssue, type IssuePatch } from "@/modules/status/lib/repo";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH — 유지보수 담당자의 조치 현황 갱신. 들어온 키만 바꾼다.
 *   { status?, actionNote?, scheduledDate?, handledBy? }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    // 형식이 틀린 id 가 DB 까지 가면 uuid 변환 오류(500)가 난다 — 없는 현황으로 취급한다
    if (!UUID_RE.test(id)) return fail("해당 현황을 찾을 수 없습니다.", 404);
    const body = await req.json();

    const patch: IssuePatch = {};
    if (body.status !== undefined) {
      if (!isStatus(body.status)) return fail("상태 값이 올바르지 않습니다.");
      patch.status = body.status;
    }
    if (body.actionNote !== undefined) patch.actionNote = String(body.actionNote ?? "");
    if (body.handledBy !== undefined) patch.handledBy = String(body.handledBy ?? "");
    if (body.scheduledDate !== undefined) {
      const d = String(body.scheduledDate ?? "").trim();
      if (d && !DATE_RE.test(d)) return fail("조치 예정일은 YYYY-MM-DD 형식이어야 합니다.");
      patch.scheduledDate = d || null;
    }

    const row = await updateIssue(id, patch);
    if (!row) return fail("해당 현황을 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
