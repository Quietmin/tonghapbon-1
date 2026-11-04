"use client";

import { useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  getCurrentSubscription,
  getPushRegistration,
} from "@/shared/lib/pushClient";
import { useToast } from "./Toast";
import { Icon } from "./ui";

/**
 * 홈 화면의 "푸시 알림" 카드 — 이 기기로 알림을 받을지 켜고 끈다.
 *
 * - 유지보수 부서: 내 지사에 새 현황이 등록되면 알림
 * - 운영부: 내가 올린 현황이 조치 완료되면 알림
 *
 * 쓸 수 없는 환경(서비스 워커 없음 = 개발 서버, 지원 안 하는 브라우저, 서버에 VAPID
 * 키 없음)에서는 아무것도 그리지 않는다. 권한이 차단돼 있으면 안내만 보여 준다.
 */

type State =
  | "checking" // 지원 여부 확인 중 — 아무것도 안 그린다 (깜빡임 방지)
  | "unavailable" // 못 쓰는 환경 — 안 그린다
  | "blocked" // 권한이 차단됨 — 안내만
  | "off"
  | "on";

export default function PushOptIn({ description }: { description: string }) {
  const toast = useToast();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const reg = await getPushRegistration();
      if (!reg) return setState("unavailable");
      try {
        const json = await (await fetch("/api/push")).json();
        if (!json.ok || !json.enabled) return setState("unavailable");
      } catch {
        return setState("unavailable");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const sub = await getCurrentSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
  }, []);

  if (state === "checking" || state === "unavailable") return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
        toast("이 기기의 알림을 껐습니다");
      } else {
        const r = await enablePush();
        if (r.ok) {
          setState("on");
          toast("이 기기로 알림을 받습니다");
        } else {
          if (Notification.permission === "denied") setState("blocked");
          toast(r.error ?? "알림을 켜지 못했습니다");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-container-lowest p-4"
      aria-label="푸시 알림 설정"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon name={state === "on" ? "notifications_active" : "notifications"} className="text-xl text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface">푸시 알림</p>
        <p className="text-xs text-on-surface-variant break-keep">
          {state === "blocked"
            ? "브라우저에서 알림이 차단돼 있습니다. 주소창의 사이트 설정에서 알림을 허용해 주세요."
            : description}
        </p>
      </div>
      {state !== "blocked" && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`shrink-0 min-h-10 px-4 rounded-full text-sm font-bold transition-colors disabled:opacity-40 ${
            state === "on"
              ? "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy ? "처리 중…" : state === "on" ? "알림 끄기" : "알림 켜기"}
        </button>
      )}
    </section>
  );
}
