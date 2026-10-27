"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/shared/components/ui";

/**
 * 중장기보수계획 ↔ 설비별 전체 현황 전환 탭.
 *
 * 두 화면은 같은 보수계획 데이터를 보는 두 시점이라 사이드바 메뉴를 하나로
 * 합치고(nav.ts에는 중장기보수계획만 남김), 화면 맨 위 이 탭으로 오간다.
 * 전체 현황을 /overhaul/plan/matrix 하위 경로로 둔 이유: 사이드바·모바일
 * 챕터 탭의 활성 판정(isActive)이 /overhaul/plan 접두사로 그대로 따라온다.
 */
const TABS = [
  { href: "/overhaul/plan", label: "중장기보수계획", icon: "event_note" },
  { href: "/overhaul/plan/matrix", label: "설비별 전체 현황", icon: "table_view" },
] as const;

export default function PlanTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="중장기보수계획 하위 화면"
      className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-border-subtle w-fit"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-sm font-bold transition-colors ${
              active
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:text-primary hover:bg-primary-container/30"
            }`}
          >
            <Icon name={t.icon} className="text-base" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
