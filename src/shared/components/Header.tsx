"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Avatar } from "./ui";
import { NAV_GROUPS, isActive } from "@/shared/lib/nav";
import { useChatbotDock } from "./ChatbotDock";

export default function Header() {
  const pathname = usePathname();
  const dock = useChatbotDock();
  // 대표 경로 밖의 하위 메뉴도 챕터 소속이다 (설비관리의 /overhaul 화면들)
  const group = NAV_GROUPS.find(
    (g) =>
      pathname === g.root ||
      pathname.startsWith(`${g.root}/`) ||
      g.items.some((it) => isActive(pathname, it)),
  );

  return (
    <header className="sticky top-0 z-40 bg-surface-glass backdrop-blur-xl border-b border-border-subtle px-gutter h-16 flex justify-between items-center w-full print:hidden">
      <div className="flex items-center gap-4 min-w-0">
        <h2 className="text-2xl font-black text-primary tracking-tight truncate">유지보수 마스터</h2>
        {group && (
          <>
            <span className="hidden sm:inline text-outline-variant">/</span>
            <span className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-on-surface-variant whitespace-nowrap">
              <Icon name={group.icon} className="text-base" />
              {group.label}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {pathname !== "/" && (
          <Link
            href="/"
            className="h-9 px-3 flex items-center gap-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold text-on-surface-variant transition-colors"
          >
            <Icon name="home" className="text-base" />
            <span className="hidden sm:inline">처음 화면</span>
          </Link>
        )}
        {/* 도크를 완전히 숨겼을 때 다시 부르는 통로 — 항상 여기 있다 */}
        <button
          type="button"
          onClick={dock.open}
          aria-label="정비 챗봇 열기"
          title="정비 챗봇 열기"
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            dock.state === "open"
              ? "bg-primary-container text-on-primary"
              : "hover:bg-surface-container-low text-on-surface-variant"
          }`}
        >
          <Icon name="smart_toy" />
        </button>
        <button className="w-9 h-9 hidden sm:flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
          <Icon name="notifications" />
        </button>
        <Avatar name="사용" size="w-8 h-8" className="border border-outline-variant" />
      </div>
    </header>
  );
}
