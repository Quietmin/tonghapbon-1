import { NextResponse } from "next/server";
import {
  createDesignStatement,
  listDesignStatements,
  getDesignStatement,
  deleteDesignStatement,
  type StatementItemInput,
} from "@/modules/overhaul/lib/maintenanceRepo";
import { resolveBranchFromRequest } from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";

/** GET → 만들어둔 수량산출서 목록, GET ?id=... → 그 산출서의 항목 전체 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { statement, items } = await getDesignStatement(id);
    if (!statement) {
      return NextResponse.json({ ok: false, error: "내역서를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, statement, items });
  }
  return NextResponse.json({
    ok: true,
    statements: await listDesignStatements(await resolveBranchFromRequest(req)),
  });
}

/** 사용자가 선택한 항목으로 수량산출서를 확정 저장한다 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetYear = Number(body.targetYear);
    if (!Number.isFinite(targetYear)) {
      return NextResponse.json({ ok: false, error: "targetYear가 필요합니다." }, { status: 400 });
    }
    const items: StatementItemInput[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ ok: false, error: "선택된 항목이 없습니다." }, { status: 400 });
    }

    const branch = await resolveBranchFromRequest(req);
    const { statementId, items: saved } = await createDesignStatement({
      targetYear,
      field: body.field ?? null,
      branch,
      title: String(
        body.title ?? `${targetYear}년도 ${branch ? `${branch} ` : ""}정기점검보수공사`,
      ),
      items,
    });
    // 저장된 항목을 그대로 돌려준다 — 화면이 이걸로 엑셀을 뽑아야
    // 각 행에 "항목ID"가 실린다 (되돌아왔을 때 정확히 이어붙는 표식).
    return NextResponse.json({ ok: true, statementId, items: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });
  const removed = await deleteDesignStatement(id);
  return NextResponse.json({ ok: true, removed });
}
