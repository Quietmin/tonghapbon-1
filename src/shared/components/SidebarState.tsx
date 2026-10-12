"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * 사이드바 여닫기 상태.
 *
 * 사이드바는 fixed 라 본문(main)이 그만큼 왼쪽 여백을 비워 두고 있다. 숨기면 그
 * 여백도 같이 접혀야 하므로, 둘 다 읽을 수 있는 자리에 상태를 둔다 —
 * 챗봇 도크(ChatbotDock)와 같은 방식이다.
 *
 * 모바일(md 미만)에서는 사이드바가 애초에 없고 하단탭을 쓰므로 이 값은 쓰이지
 * 않는다. 접기 버튼도 데스크톱에서만 보인다.
 */
const STORAGE_KEY = "sidebar-open";

interface SidebarApi {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarApi | null>(null);

export function useSidebar(): SidebarApi {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar 는 SidebarProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // 첫 렌더는 서버와 같아야 한다(하이드레이션 불일치 방지) — 늘 열린 채로 시작하고
  // 마운트 뒤에 저장값으로 맞춘다. 저장값이 "닫힘"이면 한 번 접히는 게 보이지만,
  // 반대로 하면 사이드바가 늘 한 번 번쩍이므로 이쪽이 낫다.
  const [open, setRawOpen] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "0") setRawOpen(false);
    } catch {
      /* 시크릿 창·저장소 차단에서는 기본값(열림)으로 그냥 동작한다 */
    }
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setRawOpen(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* 저장 실패는 이번 세션에서만 상태가 안 남는 정도라 무시한다 */
    }
  }, []);

  const api = useMemo<SidebarApi>(
    () => ({ open, setOpen, toggle: () => setOpen(!open) }),
    [open, setOpen],
  );

  return <SidebarContext.Provider value={api}>{children}</SidebarContext.Provider>;
}
