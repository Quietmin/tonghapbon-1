import { NextResponse } from "next/server";
import {
  createFailure,
  listFailures,
  type AttachmentInput,
  type FailureHistoryInput,
} from "@/modules/failure/lib/repo";

export const dynamic = "force-dynamic";

/** 최근 등록 목록 — 목록 화면이 생기기 전까지는 확인용으로만 쓴다 */
export async function GET() {
  try {
    const rows = await listFailures();
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** 수기 등록 — 고장제목 또는 설비명 중 하나는 있어야 한다 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FailureHistoryInput & { attachment?: AttachmentInput };
    if (!body.title?.trim() && !body.equipmentName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "고장제목 또는 설비명 중 하나는 입력해 주세요." },
        { status: 400 },
      );
    }
    const { attachment, ...input } = body;
    const { id } = await createFailure({ ...input, source: "manual" }, attachment);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
