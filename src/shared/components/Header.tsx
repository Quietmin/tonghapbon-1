"use client";

import { usePathname } from "next/navigation";
import { Icon, Avatar } from "./ui";
import { NAV_GROUPS } from "@/shared/lib/nav";

export default function Header() {
  const pathname = usePathname();
  const group = NAV_GROUPS.find(
    (g) => pathname === g.root || pathname.startsWith(`${g.root}/`),
  );

  return (
    <header className="sticky top-0 z-40 bg-surface-glass backdrop-blur-xl border-b border-border-subtle px-gutter h-16 flex justify-between items-center w-full">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-black text-primary tracking-tight">Plant Ops Hub</h2>
        {group && (
          <>
            <span className="hidden sm:inline text-outline-variant">/</span>
            <span className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-on-surface-variant">
              <Icon name={group.icon} className="text-base" />
              {group.label}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
          <Icon name="notifications" />
        </button>
        <Avatar name="사용" size="w-8 h-8" className="border border-outline-variant" />
      </div>
    </header>
  );
}
