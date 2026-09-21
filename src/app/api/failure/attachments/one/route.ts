import { NextResponse } from "next/server";
import { getAttachmentData } from "@/modules/failure/lib/repo";

export const dynamic = "force-dynamic";

/** 첨부파일 1건을 원본 바이트로 돌려준다 — 화면은 <a href="…/attachments/one?id=123"> 로 부른다. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });

  const row = await getAttachmentData(id);
  if (!row) return NextResponse.json({ ok: false, error: "첨부파일이 없습니다." }, { status: 404 });

  const m = row.data.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) return NextResponse.json({ ok: false, error: "첨부파일 형식을 읽을 수 없습니다." }, { status: 500 });

  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: {
      "content-type": m[1],
      // 한글 파일명도 깨지지 않게 RFC 5987 인코딩
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
