import { NextResponse } from "next/server";
import { getIssuePhotoData } from "@/modules/status/lib/repo";

export const dynamic = "force-dynamic";

/**
 * 현황 사진 한 장을 실제 이미지로 돌려준다 — 화면이 <img src="/api/status/photos/one?id=123"> 로 부른다.
 * DB 에는 data URL(base64)이라 여기서 바이너리로 풀어 내보낸다(브라우저가 캐시할 수 있다).
 * 사진은 덮어쓰지 않고 이슈를 지울 때만 사라지므로(id 가 곧 그 사진) 오래 캐시해도 안전하다.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });
  }
  const dataUrl = await getIssuePhotoData(id);
  if (!dataUrl) return NextResponse.json({ ok: false, error: "사진이 없습니다." }, { status: 404 });

  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) return NextResponse.json({ ok: false, error: "사진 형식을 읽을 수 없습니다." }, { status: 500 });

  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400, immutable" },
  });
}
