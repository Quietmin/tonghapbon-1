import { NextResponse } from "next/server";
import { getOrCreateProject, updateProject } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, project: await getOrCreateProject() });
}

/**
 * 프로젝트명·발전소·호기·계약기간 수정.
 * 계약기간(start_date~end_date)이 있어야 경과일·계획 공정률·지연 위험이 계산된다.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const project = await getOrCreateProject();
    await updateProject(project.id, {
      name: body.name,
      plant: body.plant,
      unit: body.unit,
      start_date: body.start_date,
      end_date: body.end_date,
    });
    return NextResponse.json({ ok: true, project: await getOrCreateProject() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
