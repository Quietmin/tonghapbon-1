"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { NAV_GROUPS, SHARED_NAV } from "@/shared/lib/nav";

// 모바일에서는 하위 메뉴까지 담을 공간이 없어 메인 메뉴 3개 + 설비 마스터만 노출한다.
const TABS = [
  ...NAV_GROUPS.map((g) => ({ href: g.root, label: g.label, icon: g.icon })),
  ...SHARED_NAV.map((s) => ({ href: s.href, label: s.label, icon: s.icon })),
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
            className={`flex flex-col items-center gap-0.5 px-2 ${
              active ? "text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={tab.icon} className="text-xl" />
            <span className="text-[10px] font-semibold whitespace-nowrap">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
