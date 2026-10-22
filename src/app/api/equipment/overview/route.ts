import { NextResponse } from "next/server";
import { listBranchOverview } from "@/modules/equipment/lib/overviewRepo";

/** 전 지사 개요 — 설비 마스터 첫 화면. 지사 선택 전에 쓰므로 지사를 요구하지 않는다. */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: await listBranchOverview() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
