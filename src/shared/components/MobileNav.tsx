"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { NAV_GROUPS, isActive, type NavItem } from "@/shared/lib/nav";

// 모바일에서는 하위 메뉴까지 담을 공간이 없어 홈 + 메인 메뉴 3개만 노출한다.
// 챗봇은 탭이 아니라 떠 있는 도크(ChatbotDock)라 여기 없다 — 그래서 탭이 4개로
// 줄어 앱 하단탭 그대로의 모양이 된다.
const TABS = [
  { href: "/", label: "홈", icon: "home", items: [] as NavItem[] },
  ...NAV_GROUPS.map((g) => ({
    href: g.root,
    label: g.short ?? g.label,
    icon: g.icon,
    // 대표 경로 밖의 하위 메뉴(설비관리의 /overhaul 화면들)에서도 탭이 켜지도록
    items: g.items,
  })),
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-glass backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-50 print:hidden">
      {TABS.map((tab) => {
        // 홈은 정확히 일치할 때만 — 아니면 모든 경로에서 홈이 활성으로 보인다
        const active =
          tab.href === "/"
            ? pathname === "/"
            : pathname === tab.href ||
              pathname.startsWith(`${tab.href}/`) ||
              tab.items.some((it) => isActive(pathname, it));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            // min-w-0 + truncate — short 를 안 넣은 항목이 생겨도 하단바가 넘치지 않게 한다
            className={`flex flex-col items-center gap-0.5 px-1 min-w-0 flex-1 ${
              active ? "text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={tab.icon} className="text-xl" />
            <span className="text-[10px] font-semibold truncate max-w-full">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
