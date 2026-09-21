// 따소미 챗봇(플로팅 위젯)용 조회 전용 요약 스냅샷.
// 숫자는 여기서 계산하지 않고 chatbotSnapshot.ts(progress.ts/schedule.ts 재사용)가 만든 값을 그대로 내려준다.
// /api/overhaul/dashboard와 내용이 겹치지만, 용도가 다르므로(챗봇 전용 필드 포함) 별도 엔드포인트로 둔다.
import { NextResponse } from "next/server";
import { getChatbotSnapshot } from "@/modules/overhaul/lib/chatbotSnapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getChatbotSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
