import { NextResponse } from "next/server";
import { BRANCHES, isBranch } from "@/shared/lib/branches";
import { DEPARTMENTS, isDepartment } from "@/shared/lib/departments";
import { DEPT_COOKIE, DEPT_COOKIE_MAX_AGE, getCurrentUser } from "@/shared/lib/currentUser";
import { BRANCH_COOKIE, BRANCH_COOKIE_MAX_AGE } from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";

/** GET — 지금 선택된 내 지사·부서와 선택지. 아직 안 골랐으면 해당 값이 null 이다 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    ok: true,
    ...user,
    branches: BRANCHES,
    departments: DEPARTMENTS,
  });
}

/**
 * POST { branch, department } — 내 지사·부서를 정한다. 로그인이 붙기 전까지의 임시 대용이라
 * 쿠키에만 담는다. 지사는 설비관리가 읽는 oh_branch 와 같은 쿠키라 어느 화면에서 골라도 이어진다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isBranch(body.branch)) {
      return NextResponse.json({ ok: false, error: "지사를 선택해 주세요." }, { status: 400 });
    }
    if (!isDepartment(body.department)) {
      return NextResponse.json({ ok: false, error: "부서를 선택해 주세요." }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, branch: body.branch, department: body.department });
    const opts = { path: "/", sameSite: "lax" as const };
    res.cookies.set(BRANCH_COOKIE, encodeURIComponent(body.branch), { ...opts, maxAge: BRANCH_COOKIE_MAX_AGE });
    res.cookies.set(DEPT_COOKIE, encodeURIComponent(body.department), { ...opts, maxAge: DEPT_COOKIE_MAX_AGE });
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
