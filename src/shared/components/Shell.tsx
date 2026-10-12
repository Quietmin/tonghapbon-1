"use client";

import Sidebar from "./Sidebar";
import Header from "./Header";
import MobileNav from "./MobileNav";
import ChatbotDock from "./ChatbotDock";
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
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar />
      <main
        className={`flex-1 w-full min-h-screen flex flex-col pb-24 md:pb-12 transition-[margin-left] duration-200 ease-out ${
          sidebar.open ? "md:ml-[280px]" : "md:ml-0"
        }`}
      >
        <Header />
        <div className="p-gutter max-w-content mx-auto w-full space-y-gutter">{children}</div>
      </main>
      <MobileNav />
      <ChatbotDock />
    </div>
  );
}
