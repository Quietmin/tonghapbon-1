"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncPushSubscription } from "@/shared/lib/pushClient";
import { useProfile } from "./ProfileGate";
import { Icon } from "./ui";

/**
 * 현황 알람 감시 — 화면이 열려 있는 동안 내 지사의 새 현황(미완료)을 주기적으로 확인해서
 *   - 화면 위쪽에 팝업을 띄우고 (앱이 열려 있으면 푸시보다 이쪽이 먼저 눈에 띈다)
 *   - 설치형(PWA) 앱 아이콘에 미완료 건수 배지를 단다
 *
 * 담당부서를 가리지 않고 내 지사의 모든 현황을 본다 — 푸시(shared/lib/push.ts)가 지사
 * 전체로 가므로 화면 쪽도 같은 범위여야 한다. 그래서 운영부로 로그인해도 알람이 뜨고,
 * 현황을 올린 본인에게도 뜬다(지사 전체가 같이 알고 있어야 한다는 요구).
 *
 * 꺼져 있는 기기로의 알림은 웹 푸시(sw.js + shared/lib/push.ts)가 맡고, 이 컴포넌트는
 * "열려 있는 화면"만 맡는다. 어느 화면에서나 떠야 하므로 Shell 에 한 번만 마운트한다.
 *
 * 마지막으로 본 등록 시각을 localStorage 에 남겨, 새로고침했다고 같은 건이
 * 다시 울리지 않게 한다. 처음 쓰는 기기는 지금까지의 건을 기준선으로 삼고 울리지 않는다.
 */

const POLL_MS = 30_000;

interface IssueLite {
  id: string;
  equipment_name: string;
  content: string;
  department: string;
  reporter: string;
  created_at: string;
}

interface Alarm {
  issue: IssueLite;
  /** 같은 폴링에서 함께 발견된 추가 건수 ("외 n건") */
  more: number;
}

/** 지사 단위로 본다 — 부서를 바꿔도 이미 본 건이 다시 울리지 않는다 */
function lastSeenKey(branch: string) {
  return `status-alarm-last-seen:${branch}`;
}

/** 설치형 앱 아이콘의 숫자 배지 — 지원하지 않는 브라우저에서는 조용히 넘어간다 */
function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

/** 짧은 알림음 — 권한·에셋 없이 WebAudio 로 두 음을 낸다. 막혀 있으면(사용자 조작 전) 조용히 넘어간다 */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.35);
    };
    play(880, 0);
    play(1174.66, 0.18);
    setTimeout(() => void ctx.close().catch(() => {}), 1200);
  } catch {
    /* 소리는 덤이다 */
  }
}

export default function StatusAlarm() {
  const { profile } = useProfile();
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const branch = profile?.branch ?? "";
  // 부서를 가리지 않는다 — 내 지사가 정해져 있으면 모두 본다
  const watching = Boolean(branch);

  // 접속할 때마다 한 번 — 이미 알림을 켜 둔 기기의 구독을 현재 지사·부서로 맞춘다
  useEffect(() => {
    if (profile) void syncPushSubscription();
  }, [profile]);

  const poll = useCallback(async () => {
    try {
      // 담당부서로 거르지 않는다 — 내 지사의 모든 현황이 알람 대상이다
      const sp = new URLSearchParams({ branch, status: "미완료" });
      const json = await (await fetch(`/api/status/issues?${sp}`)).json();
      if (!json.ok) return;

      const rows: IssueLite[] = json.rows ?? [];
      setAppBadge(json.counts?.["미완료"] ?? 0);

      const key = lastSeenKey(branch);
      const lastSeen = localStorage.getItem(key);
      const newest = rows.reduce<string>((m, r) => (r.created_at > m ? r.created_at : m), lastSeen ?? "");
      if (newest) localStorage.setItem(key, newest);

      // 처음 쓰는 기기(기준선 없음)는 울리지 않는다 — 지금 목록 전체가 "새 것"이 돼 버린다
      if (lastSeen === null) return;

      const fresh = rows
        .filter((r) => r.created_at > lastSeen)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      if (fresh.length > 0) {
        setAlarm({ issue: fresh[0], more: fresh.length - 1 });
        chime();
      }
    } catch {
      /* 다음 주기에 다시 — 네트워크 잠깐 끊긴 것으로 화면을 흔들지 않는다 */
    }
  }, [branch]);

  useEffect(() => {
    if (!watching) return;
    void poll();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    // 탭에 돌아오면 바로 확인한다 — 30초를 기다리지 않게
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watching, poll]);

  if (!alarm) return null;

  return (
    // 토스트(하단)와 달리 눈에 확 띄어야 해서 위쪽 가운데, 닫기 전까지 남는다
    <div className="fixed inset-x-0 top-4 z-[700] flex justify-center px-4 print:hidden">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-primary bg-surface-container-lowest p-4 shadow-xl"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon name="notifications_active" className="text-xl text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-on-surface break-keep">
            새 현황이 등록됐습니다{alarm.more > 0 && ` (외 ${alarm.more}건)`}
          </p>
          <p className="mt-0.5 text-sm text-on-surface break-keep line-clamp-2">
            <span className="font-bold">{alarm.issue.equipment_name}</span> · {alarm.issue.content}
          </p>
          {/* 지사 전체가 받으므로 "누가 조치할 일인지"를 같이 보여 준다 */}
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {alarm.issue.department} 담당 · 작성 {alarm.issue.reporter}
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/status?issue=${alarm.issue.id}`}
              onClick={() => setAlarm(null)}
              className="inline-flex min-h-9 items-center rounded-sm bg-primary px-3 text-sm font-bold text-on-primary hover:opacity-90"
            >
              현황 보기
            </Link>
            <button
              type="button"
              onClick={() => setAlarm(null)}
              className="inline-flex min-h-9 items-center rounded-sm px-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high"
            >
              닫기
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="알림 닫기"
          onClick={() => setAlarm(null)}
          className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>
    </div>
  );
}
