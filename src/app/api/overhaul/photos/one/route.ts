import { NextResponse } from "next/server";
import { getPhotoById } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";

/**
 * 사진 한 장을 실제 이미지로 돌려준다 — 화면이 <img src="…/photos/one?id=123">로 부른다.
 *
 * DB에는 data URL(base64)로 들어 있다. 그대로 JSON에 실으면 목록마다 수 MB가
 * 오가므로, 여기서 바이너리로 풀어 이미지 응답으로 내보낸다. 브라우저가 캐시할 수
 * 있게 되고(같은 사진은 다시 안 받는다) 목록 응답은 가벼워진다.
 *
 * 사진은 덮어쓰지 않고 새로 추가·삭제만 하므로(id가 곧 그 사진) 오래 캐시해도 안전하다.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });
  }

  const dataUrl = await getPhotoById(id);
  if (!dataUrl) {
    return NextResponse.json({ ok: false, error: "사진이 없습니다." }, { status: 404 });
  }

  // data:image/jpeg;base64,XXXX → mime과 본문 분리
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) {
    return NextResponse.json({ ok: false, error: "사진 형식을 읽을 수 없습니다." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: {
      "content-type": m[1],
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
