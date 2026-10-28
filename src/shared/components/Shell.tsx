"use client";

import Sidebar from "./Sidebar";
import Header from "./Header";
import ChapterSubNav from "./ChapterSubNav";
import MobileNav from "./MobileNav";
import ChatbotDock from "./ChatbotDock";
import { ProfileProvider } from "./ProfileGate";
import { ToastProvider } from "./Toast";
import { useSidebar } from "./SidebarState";

/**
 * 앱 껍데기 — 사이드바 · 헤더 · 본문 · 하단탭 · 챗봇 도크.
 *
 * layout.tsx 에서 바로 짜지 않고 따로 둔 이유: 사이드바를 숨기면 본문의 왼쪽
 * 여백도 함께 접혀야 하는데, 그러려면 여백을 상태에 따라 바꿀 수 있어야 한다
 * (= 클라이언트 컴포넌트여야 한다). children 은 서버에서 그린 그대로 들어온다.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const sidebar = useSidebar();

  return (
    // 내 지사·부서 선택 창(처음 접속 시)과 헤더 칩이 같은 상태를 쓰도록 전체를 감싼다
    <ProfileProvider>
    <ToastProvider>
    {/* overflow-x-hidden 은 여기 두지 않는다 — body 로 옮긴 이유는 layout.tsx 주석 참고
        (안쪽 div 에 두면 DocEditor 의 sticky 미리보기가 깨진다) */}
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        // 아래 여백(pb-24)은 폰 하단탭(h-16=64px)을 피하려고 둔 것 — 하단탭이
        // 이제 안전영역만큼 더 커질 수 있어(MobileNav 참고) 그만큼을 같이 더한다.
        // 그러지 않으면 안전영역이 있는 기기에서 본문 맨 아래 한 줄이 탭에 가려진다.
        className={`flex-1 w-full min-h-screen flex flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12 transition-[margin-left] duration-200 ease-out ${
          sidebar.open ? "md:ml-[280px]" : "md:ml-0"
        }`}
      >
        <Header />
        <ChapterSubNav />
        <div className="p-gutter max-w-content mx-auto w-full space-y-gutter">{children}</div>
      </main>
      <MobileNav />
      <ChatbotDock />
    </div>
    </ToastProvider>
    </ProfileProvider>
  );
}
