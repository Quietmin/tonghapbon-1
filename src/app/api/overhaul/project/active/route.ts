import { NextResponse } from "next/server";
import { getProject, listProjects } from "@/modules/overhaul/lib/repo";
import { PROJECT_COOKIE, PROJECT_COOKIE_MAX_AGE } from "@/modules/overhaul/lib/activeProject";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";

/**
 * 보고 있는 회차를 바꾼다. 쿠키를 서버가 심으므로 화면은 이 요청만 보내고
 * 데이터를 다시 읽으면 된다 (document.cookie를 직접 만지지 않는다).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    const project = id ? await getProject(id) : null;
    if (!project) {
      return NextResponse.json({ ok: false, error: "회차를 찾을 수 없습니다." }, { status: 404 });
    }

    const res = NextResponse.json({
      ok: true,
      project,
      projects: await listProjects(await resolveBranch()),
    });
    res.cookies.set(PROJECT_COOKIE, project.id, {
      path: "/",
      maxAge: PROJECT_COOKIE_MAX_AGE,
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
