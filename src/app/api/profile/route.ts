import { NextResponse } from "next/server";
import { BRANCHES, isBranch } from "@/shared/lib/branches";
import { DEPARTMENTS, isDepartment } from "@/shared/lib/departments";
import { cookies } from "next/headers";
import { DEPT_COOKIE, DEPT_COOKIE_MAX_AGE, SESSION_COOKIE, getCurrentUser } from "@/shared/lib/currentUser";
import { BRANCH_COOKIE, BRANCH_COOKIE_MAX_AGE } from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";

/**
 * GET — 지금 선택된 내 지사·부서와 선택지. 아직 안 골랐으면 해당 값이 null 이다.
 * loggedIn 은 이 브라우저 세션에서 로그인했는지 — false 면 지사·부서가 채워져 있어도 로그인 화면을 먼저 보인다.
 */
export async function GET() {
  const [user, jar] = await Promise.all([getCurrentUser(), cookies()]);
  return NextResponse.json({
    ok: true,
    ...user,
    loggedIn: Boolean(jar.get(SESSION_COOKIE)?.value),
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
    // 로그인 표시 — maxAge 가 없어 브라우저를 닫으면 사라진다. 화면이 바로 읽어 로그인 화면을 깜빡임 없이 정하도록 httpOnly 는 아니다
    res.cookies.set(SESSION_COOKIE, "1", opts);
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/** DELETE — 로그아웃. 로그인 표시만 지운다(지사·부서는 남겨 두어 다음 로그인 화면에 미리 채워진다) */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", sameSite: "lax", maxAge: 0 });
  return res;
}
