import { NextResponse } from "next/server";
import { resolveBranchFromRequest } from "@/modules/overhaul/lib/activeBranch";
import { listLongTermPlan } from "@/modules/equipment/lib/longTermRepo";

/** 설비 단위 장기 유지보수 계획 — 기본 과거 2년·올해·향후 2년(다섯 해). */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const branch = await resolveBranchFromRequest(req);
    if (!branch) {
      return NextResponse.json({ ok: false, error: "지사를 먼저 선택하세요." }, { status: 400 });
    }
    const url = new URL(req.url);
    const pastYears = Number(url.searchParams.get("pastYears") ?? "2") || 2;
    const futureYears = Number(url.searchParams.get("futureYears") ?? "2") || 2;
    const payload = await listLongTermPlan(branch, { pastYears, futureYears });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
