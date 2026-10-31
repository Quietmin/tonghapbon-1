"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/shared/components/ui";

export interface SubTab {
  href: string;
  label: string;
  icon: string;
}

/**
 * 사이드바 메뉴를 합치면서 생긴 화면 안 전환 탭의 공용 모양.
 *
 * 합쳐진 화면들은 부모 경로의 하위 주소를 쓴다(예: /overhaul/tasks/schedule) —
 * 사이드바·모바일 챕터 탭의 활성 판정(isActive)이 부모 접두사로 그대로
 * 따라오게 하기 위해서다. 옛 주소는 각 page.tsx의 redirect로 살려 둔다.
 */
export default function SubTabs({ tabs, ariaLabel }: { tabs: readonly SubTab[]; ariaLabel: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-border-subtle w-fit"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3.5 h-10 rounded-lg text-sm font-bold transition-colors ${
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
