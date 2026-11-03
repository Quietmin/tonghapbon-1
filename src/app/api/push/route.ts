import { NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/lib/currentUser";
import { deleteSubscription, getVapidPublicKey, saveSubscription } from "@/shared/lib/push";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * 웹 푸시 구독 관리.
 *   GET    — 푸시를 쓸 수 있는지와 VAPID 공개키 (브라우저가 구독할 때 필요)
 *   POST   — 이 기기의 구독을 내 지사·부서로 등록/갱신
 *   DELETE — 이 기기의 구독을 해제
 * 누구에게 어떤 알림이 가는지는 shared/lib/push.ts 참고.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ ok: true, enabled: Boolean(publicKey), publicKey });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    if (!endpoint || !p256dh || !auth) return fail("구독 정보가 올바르지 않습니다.");

    const user = await getCurrentUser();
    if (!user.branch || !user.department) return fail("지사와 부서를 먼저 선택해 주세요.");

    await saveSubscription({ endpoint, p256dh, auth, branch: user.branch, department: user.department });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return fail("구독 정보가 올바르지 않습니다.");
    await deleteSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
