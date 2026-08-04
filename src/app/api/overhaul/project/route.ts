import { NextResponse } from "next/server";
import { getOrCreateProject, updateProject, type OverhaulProject } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

type ProjectPatch = Partial<Pick<OverhaulProject, "name" | "plant" | "unit" | "start_date" | "end_date">>;
const PATCHABLE_FIELDS: (keyof ProjectPatch)[] = ["name", "plant", "unit", "start_date", "end_date"];

export async function GET() {
  return NextResponse.json({ ok: true, project: await getOrCreateProject() });
}

/**
 * 프로젝트명·발전소·호기·계약기간 수정. 부분 수정(PATCH)이라 body에 실제로 들어있는
 * 필드만 반영한다 — 예전엔 5개 필드를 항상 다 보내서, 일부만 보낸 호출이 나머지를
 * undefined(=NULL)로 덮어써 name에 NOT NULL 위반이 나는 버그가 있었다.
 * 계약기간(start_date~end_date)이 있어야 경과일·계획 공정률·지연 위험이 계산된다.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const patch: ProjectPatch = {};
    for (const key of PATCHABLE_FIELDS) {
      if (key in body) patch[key] = body[key];
    }

    const project = await getOrCreateProject();
    await updateProject(project.id, patch);
    return NextResponse.json({ ok: true, project: await getOrCreateProject() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
