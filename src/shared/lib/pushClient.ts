"use client";

/**
 * 웹 푸시 — 브라우저 쪽 구독 처리. 서버 쪽(발송)은 shared/lib/push.ts.
 *
 * 흐름: 사용자가 [알림 켜기]를 누르면 → 브라우저 알림 권한을 묻고 → 서비스 워커의
 * pushManager 로 구독을 만들어 → /api/push 에 올린다(내 지사·부서는 서버가 쿠키로 읽는다).
 *
 * 개발 서버에서는 서비스 워커를 등록하지 않으므로(PwaRegister 참고) 구독 자체가
 * 불가능하다 — getPushRegistration() 이 null 을 돌려주고 화면은 알림 UI 를 감춘다.
 */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 등록된 서비스 워커 (없으면 null — 개발 서버이거나 등록 실패) */
export async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** 이 기기의 현재 푸시 구독 (없으면 null) */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getPushRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** VAPID 공개키(base64url)를 pushManager.subscribe 가 받는 바이트 배열로 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 구독을 서버에 등록/갱신한다 (지사·부서는 서버가 쿠키에서 읽는다) */
async function uploadSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "알림 등록에 실패했습니다.");
}

/**
 * 알림 켜기 — 권한을 묻고 구독해 서버에 올린다.
 * 실패 사유를 사람이 읽을 메시지로 돌려준다 (throw 하지 않는다).
 */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  const reg = await getPushRegistration();
  if (!reg) return { ok: false, error: "이 브라우저에서는 알림을 쓸 수 없습니다." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "알림 권한이 허용되지 않았습니다. 브라우저 설정에서 허용해 주세요." };
  }

  try {
    const keyRes = await (await fetch("/api/push")).json();
    if (!keyRes.ok || !keyRes.publicKey) {
      return { ok: false, error: "서버에 알림 설정이 없습니다. 관리자에게 알려 주세요." };
    }
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      }));
    await uploadSubscription(sub);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "알림 등록에 실패했습니다." };
  }
}

/** 알림 끄기 — 구독을 해제하고 서버에서도 지운다 */
export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

/**
 * 이미 켜 둔 기기의 구독을 현재 지사·부서로 다시 올린다 — 계정 설정에서 지사·부서를
 * 바꾸면(페이지가 새로 뜨면) 알림 대상도 따라 바뀌도록 홈 셸이 접속마다 부른다.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const sub = await getCurrentSubscription();
  if (!sub) return;
  await uploadSubscription(sub).catch(() => {});
}
