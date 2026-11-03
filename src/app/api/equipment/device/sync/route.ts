import { NextResponse } from "next/server";
import { resolveBranchFromRequest } from "@/modules/overhaul/lib/activeBranch";
import { syncDevicesFromPlans } from "@/shared/lib/equipment";

/**
 * 보수계획 태그번호 → 기기·태그 일괄 등록.
 *
 * 새 업로드는 saveParsedPlan이 자동으로 등록하므로, 이 엔드포인트는
 * 이미 올라가 있는 계획을 소급 반영할 때 쓴다. 새 태그만 추가되고
 * 기존 기기는 덮어쓰지 않으므로 몇 번을 불러도 안전하다.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let branch: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.branch === "string" && body.branch) branch = body.branch;
    } catch {
      // body 없이 부르면 활성 지사로
    }
    branch ??= await resolveBranchFromRequest(req);
    if (!branch) {
      return NextResponse.json({ ok: false, error: "지사를 먼저 선택하세요." }, { status: 400 });
    }
    const added = await syncDevicesFromPlans(branch);
    return NextResponse.json({ ok: true, branch, added });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
