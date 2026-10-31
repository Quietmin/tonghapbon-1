"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeGroup, isActive } from "@/shared/lib/nav";

const ACCENT_ACTIVE = {
  primary: "bg-primary text-on-primary",
  tertiary: "bg-tertiary text-on-tertiary",
} as const;

/** 좁은 그리드 칸에 맞추려고 이 탭 안에서만 쓰는 짧은 이름. nav.ts 의 label 은
 *  사이드바 등 다른 곳에서 그대로 "설비 마스터"로 읽혀야 하므로 안 건드린다. */
const MOBILE_LABEL_OVERRIDE: Record<string, string> = {
  "/equipment": "메인",
};

/**
 * 모바일 전용 — 지금 들어와 있는 챕터(설비관리·매뉴얼관리·고장관리)의 하위
 * 화면 목록을 헤더 바로 아래 고정해 둔다.
 *
 * 데스크톱은 이미 사이드바가 이 역할을 한다(챕터를 펼치면 같은 목록이
 * 보인다) — 그래서 이 바는 md:hidden 이다.
 *
 * 하위 화면이 많은 챕터(설비관리 10개)는 좌우로 넘기게 하지 않고 6개씩
 * 2행 그리드로 깔아 화면 안에서 전부 보이게 한다. 하위 화면이 2~3개뿐인
 * 챕터(매뉴얼관리·고장관리)는 그리드로 벌리면 어색하게 떠 보이므로 가운데
 * 정렬한 알약 한 줄로 둔다.
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

  // 넉넉히 들어갈 때만 6열 그리드 — 적을 때 그리드를 쓰면 칸이 남아 어색하다.
  const dense = items.length > 4;

  return (
    <nav
      // px-gutter 만 쓴다(mx 없이) — Shell.tsx 에서 이 바는 패딩 없는 <main> 의
      // 바로 아래 자식이라 이미 뷰포트 폭 그대로다. 예전에 -mx-gutter 로 패딩을
      // "상쇄"하려 했는데, 상쇄할 패딩이 애초에 없어서 반대로 양옆 24px씩
      // 뷰포트 밖으로 새어나가 버렸다 — 그 24px이 좌우로 살짝 움직이는 여지였다.
      className={`md:hidden sticky top-16 z-30 px-gutter bg-surface-glass backdrop-blur-xl border-b border-border-subtle ${
        dense ? "py-2" : "py-3"
      }`}
      aria-label={`${group.label} 하위 화면`}
    >
      <div className={dense ? "grid grid-cols-6 gap-1" : "flex gap-3"}>
        {items.map((item) => {
          const active = isActive(pathname, item);
          const label = MOBILE_LABEL_OVERRIDE[item.href] ?? item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              // 2~3개뿐일 때는 균등폭(flex-1)의 큰 버튼으로 둬서 탭 전환을 확실하고
              // 쉽게 누를 수 있게 한다 — 많을 때(dense)는 6열 그리드라 폭을 안 나눈다.
              className={`text-center leading-tight transition-colors ${
                dense
                  ? "px-1 py-1.5 rounded-md text-xs font-bold"
                  : "flex-1 px-4 py-3 rounded-xl text-base font-bold"
              } ${active ? ACCENT_ACTIVE[group.accent] : "bg-surface-container-high text-on-surface-variant"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
