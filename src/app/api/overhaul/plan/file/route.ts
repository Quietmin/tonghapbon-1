import { NextResponse } from "next/server";
import { queryOne } from "@/shared/lib/db";

export const dynamic = "force-dynamic";

/**
 * 업로드한 중장기 보수계획 엑셀 원본 다운로드.
 * GET /api/overhaul/plan/file?id=<sourceId>
 *
 * file_data가 없는 건(이 기능이 생기기 전 업로드)은 404로 안내한다.
 */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });

    const row = await queryOne<{ file_name: string; file_data: Uint8Array | null }>(
      `select file_name, file_data from maintenance_plan_source where id = $1`,
      [id],
    );
    if (!row) {
      return NextResponse.json({ ok: false, error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!row.file_data) {
      return NextResponse.json(
        { ok: false, error: "원본이 보관되지 않은 파일입니다. (원본 보관 기능 이전에 올린 파일은 다시 올리면 내려받을 수 있습니다)" },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(row.file_data), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="plan.xlsx"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
