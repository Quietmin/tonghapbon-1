import { NextResponse } from "next/server";
import { listPlanMatrix } from "@/modules/overhaul/lib/maintenanceRepo";

export const dynamic = "force-dynamic";

/**
 * GET — 전체 설비의 장기 보수 현황 매트릭스.
 * 특정 한 해만 보는 /api/overhaul/plan과 달리, 과거 이력 전체 + 향후 futureYears년을
 * 한 장으로 돌려준다. 실적이 쌓일수록 과거 구간이 길어져 30년 이상 추적을 지원한다.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const futureYears = Number(sp.get("futureYears")) || 5;
    const includeInactive = sp.get("includeInactive") === "1";
    const payload = await listPlanMatrix({ futureYears, includeInactive });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
