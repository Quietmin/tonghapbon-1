import { NextResponse } from "next/server";
import {
  listJudgedPlans,
  summarize,
  listPlanSources,
  listAvailableYears,
  deletePlanSource,
} from "@/modules/overhaul/lib/maintenanceRepo";

export const dynamic = "force-dynamic";

/**
 * GET ?year=2026 → 그 연도 기준 보수 대상 판정 결과 전체 + 요약
 *
 * 판정은 저장된 등급을 그대로 읽는 게 아니라 매번 계산한다.
 * (실적이 추가되면 별도 작업 없이 판정이 갱신되도록)
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const years = await listAvailableYears();
    const requested = Number(sp.get("year"));
    // 요청 연도가 없으면 올해, 올해가 계획 범위 밖이면 범위 안에서 가장 가까운 해
    const thisYear = new Date().getFullYear();
    const targetYear =
      Number.isFinite(requested) && requested > 0
        ? requested
        : years.includes(thisYear)
          ? thisYear
          : (years[years.length - 1] ?? thisYear);

    const rows = await listJudgedPlans(targetYear);
    const sources = await listPlanSources();

    return NextResponse.json({
      ok: true,
      targetYear,
      availableYears: years,
      sources,
      summary: summarize(rows),
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** ?sourceId=... 업로드 파일 단위 되돌리기 (딸린 계획·등급도 함께 지워진다) */
export async function DELETE(req: Request) {
  const sourceId = new URL(req.url).searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "sourceId가 없습니다." }, { status: 400 });
  }
  const removed = await deletePlanSource(sourceId);
  return NextResponse.json({ ok: true, removed });
}
