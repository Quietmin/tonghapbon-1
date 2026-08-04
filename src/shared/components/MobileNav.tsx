"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { NAV_GROUPS, SHARED_NAV } from "@/shared/lib/nav";

// 모바일에서는 하위 메뉴까지 담을 공간이 없어 홈 + 메인 메뉴 4개 + 설비 마스터만 노출한다.
// 탭이 6개라 라벨은 nav 의 short(짧은 이름)를 쓴다 — "오버홀 공정관리" 를 그대로 쓰면
// 좁은 화면에서 한 줄을 넘긴다.
const TABS = [
  { href: "/", label: "홈", icon: "home" },
  ...NAV_GROUPS.map((g) => ({ href: g.root, label: g.short ?? g.label, icon: g.icon })),
  ...SHARED_NAV.map((s) => ({ href: s.href, label: s.short ?? s.label, icon: s.icon })),
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-glass backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-50">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
