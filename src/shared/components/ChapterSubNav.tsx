"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeGroup, isActive } from "@/shared/lib/nav";

const ACCENT_ACTIVE = {
  primary: "bg-primary text-on-primary",
  tertiary: "bg-tertiary text-on-tertiary",
} as const;

/**
 * 모바일 전용 — 지금 들어와 있는 챕터(설비관리·매뉴얼관리·고장관리)의 하위
 * 화면 목록을 헤더 바로 아래 가로 스크롤 띠로 고정해 둔다.
 *
 * 데스크톱은 이미 사이드바가 이 역할을 한다(챕터를 펼치면 같은 목록이
 * 보인다) — 그래서 이 바는 md:hidden 이다. 설비관리처럼 하위 화면이 많은
 * 챕터(설비 마스터·보수계획·전체 현황·회차 관리·대시보드·업로드 분석·작업
 * 관리·공정표·실적입력·보고서)를 폰에서 오갈 때, 뒤로가기 없이 탭 하나로
 * 바로 다음 화면으로 넘어가게 하기 위해서다.
 *
 * Shell.tsx 에서 Header 바로 아래, 모든 페이지에 공통으로 둔다 — 챕터 바깥
 * 화면(홈 등)에서는 activeGroup 이 null 이라 아무것도 그리지 않는다.
 */
export default function ChapterSubNav() {
  const pathname = usePathname();
  const group = activeGroup(pathname);
  if (!group) return null;

  // 하위 화면이 대표 경로 하나뿐이면(매뉴얼/고장처럼 2개뿐이어도 의미가
  // 있으니 1개일 때만 숨긴다) 띠를 그릴 이유가 없다.
  const items = group.items.filter((it) => !it.desktopOnly);
  if (items.length <= 1) return null;

  return (
    <nav
      className="md:hidden sticky top-16 z-30 -mx-gutter px-gutter py-2 bg-surface-glass backdrop-blur-xl border-b border-border-subtle overflow-x-auto no-scrollbar"
      aria-label={`${group.label} 하위 화면`}
    >
      <div className="flex gap-1.5 w-max">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                active
                  ? ACCENT_ACTIVE[group.accent]
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
