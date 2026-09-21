import { NextResponse } from "next/server";
import { BRANCHES, isBranch } from "@/shared/lib/branches";
import {
  BRANCH_COOKIE,
  BRANCH_COOKIE_MAX_AGE,
  resolveBranch,
} from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";

/** GET — 지금 보고 있는 지사와 전체 지사 목록. branch가 null이면 아직 선택 전이다 */
export async function GET() {
  return NextResponse.json({ ok: true, branch: await resolveBranch(), branches: BRANCHES });
}

/**
 * POST { branch } — 보고 있는 지사를 바꾼다. 쿠키를 서버가 심으므로 화면은
 * 이 요청만 보내고 데이터를 다시 읽으면 된다 (회차 전환과 같은 방식).
 * branch: null 이면 선택을 지운다 — 다시 지사 선택 화면이 뜬다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.branch === null) {
      const res = NextResponse.json({ ok: true, branch: null, branches: BRANCHES });
      res.cookies.delete(BRANCH_COOKIE);
      return res;
    }

    if (!isBranch(body.branch)) {
      return NextResponse.json({ ok: false, error: "지사 목록에 없는 값입니다." }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, branch: body.branch, branches: BRANCHES });
    res.cookies.set(BRANCH_COOKIE, encodeURIComponent(body.branch), {
      path: "/",
      maxAge: BRANCH_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
