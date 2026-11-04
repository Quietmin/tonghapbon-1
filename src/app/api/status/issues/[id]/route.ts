import { NextResponse, after } from "next/server";
import { isStatus } from "@/modules/status/lib/constants";
import { parseIssueBody } from "@/modules/status/lib/issueInput";
import {
  deleteIssue,
  editIssue,
  getIssue,
  replaceIssuePhotos,
  updateIssue,
  type IssuePatch,
} from "@/modules/status/lib/repo";
import { notifyIssueResolved } from "@/shared/lib/push";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — 현황 한 건. 알림을 눌러 들어올 때(/status?issue=…) 필터와 무관하게 그 건을 찾는 데 쓴다 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return fail("해당 현황을 찾을 수 없습니다.", 404);
    const row = await getIssue(id);
    if (!row) return fail("해당 현황을 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

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

    // 조치완료로 "바뀌는" 순간을 잡으려면 이전 상태가 필요하다 — 이미 완료였던 건을
    // 다시 저장할 때(메모 수정 등)까지 운영부에 알림이 또 가면 안 된다.
    const before = patch.status === "조치완료" ? await getIssue(id) : null;

    const row = await updateIssue(id, patch);
    if (!row) return fail("해당 현황을 찾을 수 없습니다.", 404);

    if (before && before.status !== "조치완료") {
      // 그 지사 운영부 기기들로 푸시 — 응답을 먼저 보내고 뒤에서 발송한다
      after(() => notifyIssueResolved(row));
    }

    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/**
 * PUT — 현황 조회의 [수정]. 작성 화면에서 고친 내용(등록 때와 같은 본문)으로 덮어쓴다.
 *   { branch, equipmentName, content, department, reporter, photos }
 * photos 는 남길 사진 전부(기존 + 새로 고른 것)라 사진을 통째로 바꾼다. 조치 상태는 그대로 둔다.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return fail("해당 현황을 찾을 수 없습니다.", 404);
    const parsed = parseIssueBody(await req.json());
    if ("error" in parsed) return fail(parsed.error);

    if (!(await editIssue(id, parsed.input))) return fail("해당 현황을 찾을 수 없습니다.", 404);

    // 등록과 같이 사진만 실패해도(예: 배포 DB 에 사진 테이블이 아직 없음) 내용 수정은 남기고 알린다
    let photosSaved = 0;
    let photoWarning: string | undefined;
    try {
      photosSaved = await replaceIssuePhotos(id, parsed.photos);
    } catch (e) {
      console.error("[api/status/issues/:id] 사진 저장 실패:", e instanceof Error ? e.message : e);
      photoWarning = "현황은 수정됐지만 사진은 저장하지 못했습니다. 관리자에게 알려 주세요.";
    }
    return NextResponse.json({ ok: true, id, photosSaved, photoWarning });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/**
 * DELETE — 현황 조회의 [삭제]. 화면은 삭제 암호를 한 번 더 묻는다(shared/lib/deletePassword.ts —
 * 실수 방지일 뿐 보안이 아니다). 사진도 함께 지워진다.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return fail("해당 현황을 찾을 수 없습니다.", 404);
    if (!(await deleteIssue(id))) return fail("해당 현황을 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
