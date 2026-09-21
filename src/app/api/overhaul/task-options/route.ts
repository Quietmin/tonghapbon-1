import { NextResponse } from "next/server";
import { listTaskOptions, getTask } from "@/modules/overhaul/lib/repo";
import { resolveProjectFromRequest } from "@/modules/overhaul/lib/activeProject";

export const dynamic = "force-dynamic";

/**
 * 실적 입력 화면의 작업 선택 드롭다운용 — 가벼운 목록만.
 *
 * 수천 건짜리 내역서에서도 화면이 버티도록 상한을 두고 잘라 보낸다.
 * ?q= 로 좁혀 찾을 수 있고, ?include= 로 지금 선택된 작업은 목록 밖이어도
 * 반드시 끼워 넣는다(안 그러면 선택칸이 빈 것처럼 보인다).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const project = await resolveProjectFromRequest(req);
    const options = await listTaskOptions(project.id, { q: sp.get("q") ?? undefined });

    const include = sp.get("include");
    if (include && !options.some((o) => o.id === include)) {
      const t = await getTask(include);
      if (t) {
        options.unshift({ id: t.id, name: t.name, equipment_type: t.equipment_type });
      }
    }

    return NextResponse.json({ ok: true, project, options, truncated: options.length >= 300 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
