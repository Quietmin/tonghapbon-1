"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, isActive, type NavItem } from "@/shared/lib/nav";

// 모바일에서는 하위 메뉴까지 담을 공간이 없어 홈 + 메인 메뉴 3개만 노출한다.
// 챗봇은 탭이 아니라 떠 있는 도크(ChatbotDock)라 여기 없다 — 그래서 탭이 4개로
// 줄어 앱 하단탭 그대로의 모양이 된다.
const TABS = [
  { href: "/", label: "홈", accent: "primary" as const, items: [] as NavItem[] },
  ...NAV_GROUPS.map((g) => ({
    href: g.root,
    // 아이콘을 없애고 글자만 쓰므로 줄인 이름(short) 대신 온전한 이름을 쓴다 —
    // "설비"보다 "설비관리"가 한눈에 또렷하다.
    label: g.label,
    // 켜진 탭을 챕터 색으로 — 데스크톱 사이드바와 같은 색이라 기기를 옮겨도 같게 읽힌다
    accent: g.accent,
    // 대표 경로 밖의 하위 메뉴(설비관리의 /overhaul 화면들)에서도 탭이 켜지도록
    items: g.items,
  })),
];

const TAB_ACTIVE = {
  primary: "text-primary",
  tertiary: "text-tertiary",
} as const;

export default function MobileNav() {
  const pathname = usePathname();

  return (
    // min-h-16(고정 h-16 아님) + 안전영역 padding — 홈버튼이 없는 아이폰(설치해서
    // 쓸 때 특히)은 화면 맨 아래에 제스처로 홈 가는 밀어올리기 구역이 있다. 탭을
    // 거기 바짝 붙이면 손가락이 걸리거나 시스템 제스처와 겹친다. viewport-fit=cover
    // (layout.tsx) 를 켜 둬야 env(safe-area-inset-bottom) 가 0 이 아닌 실제 값을
    // 준다 — 둘이 짝이다.
    <nav className="md:hidden fixed bottom-0 left-0 right-0 min-h-16 pb-[env(safe-area-inset-bottom)] bg-surface-glass backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-50 print:hidden">
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
            // 아이콘 없이 글자만 — 세로로 쌓던 두 줄(아이콘+캡션)이 한 줄로 줄어
            // 글자를 더 키울 여유가 생겼다. min-w-0 + truncate 로 넘침만 막는다.
            className={`flex items-center justify-center px-1 min-w-0 flex-1 h-full ${
              active ? TAB_ACTIVE[tab.accent] : "text-on-surface-variant"
            }`}
          >
            <span className={`text-sm truncate max-w-full ${active ? "font-bold" : "font-semibold"}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
