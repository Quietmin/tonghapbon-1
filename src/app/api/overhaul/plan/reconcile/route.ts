import { NextResponse } from "next/server";
import {
  suggestReconciliation,
  searchActivePlansLite,
  reconcileStatement,
  type ReconcileDecision,
} from "@/modules/overhaul/lib/maintenanceRepo";

export const dynamic = "force-dynamic";

/**
 * GET ?statementId=... → 그 내역서 항목별 완료 제안(참고용)
 * GET ?q=...           → "계획에 없던 추가 보수" 검색용 설비 목록
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const statementId = sp.get("statementId");
    const q = sp.get("q");

    if (statementId) {
      const result = await suggestReconciliation(statementId);
      return NextResponse.json({ ok: true, ...result });
    }
    if (q != null) {
      const results = await searchActivePlansLite(q);
      return NextResponse.json({ ok: true, results });
    }
    return NextResponse.json({ ok: false, error: "statementId 또는 q가 필요합니다." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** 사람이 확인한 완료·미완료 결정을 이력으로 반영하고, 내역서를 반영 완료로 표시한다 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      statementId: string;
      targetYear: number;
      decisions: ReconcileDecision[];
    };
    if (!body.statementId || !Number.isFinite(body.targetYear)) {
      throw new Error("statementId와 targetYear가 필요합니다.");
    }
    const result = await reconcileStatement({
      statementId: body.statementId,
      targetYear: body.targetYear,
      decisions: Array.isArray(body.decisions) ? body.decisions : [],
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
