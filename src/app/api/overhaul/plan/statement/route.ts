import { NextResponse } from "next/server";
import {
  createDesignStatement,
  listDesignStatements,
  getDesignStatement,
  deleteDesignStatement,
  type StatementItemInput,
} from "@/modules/overhaul/lib/maintenanceRepo";

export const dynamic = "force-dynamic";

/** GET → 만들어둔 설계내역서 목록, GET ?id=... → 그 내역서의 항목 전체 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { statement, items } = await getDesignStatement(id);
    if (!statement) {
      return NextResponse.json({ ok: false, error: "내역서를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, statement, items });
  }
  return NextResponse.json({ ok: true, statements: await listDesignStatements() });
}

/** 사용자가 선택한 항목으로 설계내역서를 확정 저장한다 */
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

    const { statementId } = await createDesignStatement({
      targetYear,
      field: body.field ?? null,
      title: String(body.title ?? `${targetYear}년도 정기점검보수공사`),
      items,
    });
    return NextResponse.json({ ok: true, statementId });
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
