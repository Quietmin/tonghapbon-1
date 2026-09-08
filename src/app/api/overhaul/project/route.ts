import { NextResponse } from "next/server";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getProject,
  type OverhaulProject,
} from "@/modules/overhaul/lib/repo";
import {
  resolveProjectFromRequest,
  PROJECT_COOKIE,
  PROJECT_COOKIE_MAX_AGE,
} from "@/modules/overhaul/lib/activeProject";

export const dynamic = "force-dynamic";

type ProjectPatch = Partial<Pick<OverhaulProject, "name" | "plant" | "unit" | "start_date" | "end_date">>;
const PATCHABLE_FIELDS: (keyof ProjectPatch)[] = ["name", "plant", "unit", "start_date", "end_date"];

function pickPatch(body: Record<string, unknown>): ProjectPatch {
  const patch: ProjectPatch = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in body) patch[key] = body[key] as never;
  }
  return patch;
}

/** GET → 활성 회차 + 전체 회차 목록 */
export async function GET(req: Request) {
  try {
    const project = await resolveProjectFromRequest(req);
    return NextResponse.json({ ok: true, project, projects: await listProjects() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * 새 회차 생성. 만든 회차를 곧바로 활성으로 바꾼다 —
 * 만들자마자 그 회차로 작업하려는 게 거의 항상 의도다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const project = await createProject({
      name: String(body.name ?? "").trim(),
      plant: body.plant ?? null,
      unit: body.unit ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
    });

    const res = NextResponse.json({
      ok: true,
      project,
      projects: await listProjects(),
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

/**
 * 회차 정보 수정. body.id가 있으면 그 회차를, 없으면 활성 회차를 고친다.
 * 부분 수정이라 body에 실제로 들어있는 필드만 반영한다 — 5개를 항상 다 보내면
 * 일부만 보낸 호출이 나머지를 NULL로 덮어써 name에 NOT NULL 위반이 난다.
 * 계약기간(start_date~end_date)이 있어야 경과일·계획 공정률·지연 위험이 계산된다.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const target = body.id
      ? await getProject(String(body.id))
      : await resolveProjectFromRequest(req);
    if (!target) {
      return NextResponse.json({ ok: false, error: "회차를 찾을 수 없습니다." }, { status: 404 });
    }

    await updateProject(target.id, pickPatch(body));
    return NextResponse.json({
      ok: true,
      project: await getProject(target.id),
      projects: await listProjects(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * ?id=... 회차 삭제. 딸린 업로드 이력·작업항목·실적이 함께 지워진다.
 * 마지막 회차는 지우지 못하게 막는다 — 지우면 화면이 전부 빈 상태가 되고,
 * 다음 요청에서 기본 회차가 새로 생겨 오히려 헷갈린다.
 */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });

    const all = await listProjects();
    if (all.length <= 1) {
      return NextResponse.json(
        { ok: false, error: "마지막 회차는 지울 수 없습니다. 새 회차를 먼저 만드세요." },
        { status: 400 },
      );
    }

    await deleteProject(id);
    const projects = await listProjects();

    // 활성 회차를 지웠다면 남은 최신 회차로 옮겨준다
    const res = NextResponse.json({ ok: true, projects, project: projects[0] });
    res.cookies.set(PROJECT_COOKIE, projects[0].id, {
      path: "/",
      maxAge: PROJECT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
