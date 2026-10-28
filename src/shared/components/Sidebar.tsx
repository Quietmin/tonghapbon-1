"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCENT_STYLE, Icon } from "./ui";
import { NAV_GROUPS, activeGroup, isActive, type NavGroup } from "@/shared/lib/nav";
import { useSidebar } from "./SidebarState";
import { useProfile } from "./ProfileGate";

const LINK_BASE =
  "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-body-md";

/* 챕터 색은 nav.ts 가 들고 있다 — 사이드바는 그 값을 읽어 칠하기만 한다 */
const GROUP_ACTIVE = {
  primary: "text-primary",
  tertiary: "text-tertiary",
} as const;

/** 사이드바 꼭대기의 내 지사·부서 카드 */
function ProfileCard() {
  const { profile, open } = useProfile();
  // 아직 조회 전이면 자리만 잡아 둔다(레이아웃이 밀리지 않게)
  if (profile === undefined) return <div className="flex-1 h-12" aria-hidden />;
  return (
    <button
      type="button"
      onClick={open}
      title="내 지사·부서 변경"
      aria-label={
        profile ? `내 지사·부서: ${profile.branch} ${profile.department} (눌러서 변경)` : "지사·부서 선택"
      }
      className="flex items-center gap-3 px-3 py-2 min-w-0 flex-1 rounded-lg text-left hover:bg-surface-container-high transition-colors"
    >
      <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center">
        <Icon name="badge" className="text-xl" />
      </span>
      <span className="min-w-0">
        <span className="block text-title-sm font-black text-on-surface leading-tight truncate">
          {profile ? profile.branch : "지사·부서 선택"}
        </span>
        <span className="block text-xs text-on-surface-variant truncate">
          {profile ? profile.department : "눌러서 고르기"}
        </span>
      </span>
    </button>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const sidebar = useSidebar();

  /*
   * 펼친 챕터는 한 번에 하나뿐이다(아코디언) — 지금 보고 있는 챕터의 하위 메뉴만 보이고,
   * 다른 챕터를 고르면 앞의 것은 접힌다. 여러 챕터를 열어 두면 메뉴가 길어져 지금 어디 있는지
   * 흐려진다. 서버와 브라우저가 같은 pathname 을 보므로 첫 렌더가 어긋나지 않는다.
   */
  const [openKey, setOpenKey] = useState<NavGroup["key"] | null>(
    () => activeGroup(pathname)?.key ?? null,
  );

  /*
   * 화면을 옮기면 그 챕터만 펼친다. 챕터 밖 화면(처음 화면 등)으로 가면 모두 접는다 —
   * 어느 챕터도 "지금 선택한 것"이 아니기 때문이다.
   */
  useEffect(() => {
    setOpenKey(activeGroup(pathname)?.key ?? null);
  }, [pathname]);

  /** 화살표로 펼치고 접는다. 다른 챕터를 펼치면 지금 열린 것은 자동으로 접힌다 */
  function toggleGroup(key: NavGroup["key"]) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  return (
    <aside
      // 숨길 때는 왼쪽으로 밀어 둔다. inert 를 함께 걸어야 보이지 않는데도
      // Tab 으로 안쪽에 들어가는 일이 없다.
      inert={!sidebar.open}
      className={`hidden md:flex flex-col p-4 gap-2 h-screen fixed left-0 top-0 w-[280px] bg-surface-container-highest border-r border-border-subtle z-50 overflow-y-auto transition-transform duration-200 ease-out ${
        sidebar.open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2 mb-4 shrink-0">
        {/*
          내 지사·부서 — 위쪽 헤더에 이미 PIMS 로고와 "플랜트 지능형 관리시스템"이 있어서 사이드바
          꼭대기에 같은 로고를 또 두면 복잡해 보인다. 그 자리에 "지금 어느 지사·부서로 보고 있는지"를
          보여 준다. 누르면 바꾸는 창이 열린다. (홈으로 가는 길은 헤더의 로고·제목 링크)
        */}
        <ProfileCard />
        {/* 메뉴를 숨기고 다시 부르는 버튼은 헤더의 ☰ 하나뿐이다 — 사이드바 안에 같은 버튼을 또 두면 복잡해 보인다 */}
      </div>

      {/* 메인 메뉴 3개 — 화살표를 눌러 각각 펼치고 접는다 */}
      <nav className="flex-1 flex flex-col gap-1">
        {NAV_GROUPS.map((group) => {
          // 대표 경로 밖의 하위 메뉴도 있다 (설비관리 챕터의 /overhaul 화면들) —
          // root 접두사만 보면 그 화면에서 챕터가 꺼져 보이므로 항목까지 본다.
          const groupActive =
            pathname === group.root ||
            pathname.startsWith(`${group.root}/`) ||
            group.items.some((it) => isActive(pathname, it));
          // 하위가 대표 경로 하나뿐이면 펼쳐도 같은 링크가 두 번 나올 뿐이라 접어 둔다
          const hasItems = !(group.items.length === 1 && group.items[0].href === group.root);
          const expanded = hasItems && openKey === group.key;

          return (
            <div key={group.key} className="flex flex-col gap-1">
              {/*
                제목을 누르면 챕터 첫 화면으로 가고, 화살표를 누르면 펼치고 접는다.
                한 버튼에 둘을 묶으면 "메뉴만 보려는데 화면이 바뀌는" 일이 생긴다.
              */}
              <div
                className={`flex items-center justify-between rounded-lg font-bold text-title-sm ${
                  groupActive ? GROUP_ACTIVE[group.accent] : "text-on-surface"
                }`}
              >
                <Link
                  href={group.root}
                  className="flex items-center min-w-0 flex-1 px-4 py-2.5 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <span className="truncate">{group.label}</span>
                </Link>
                {hasItems && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={expanded}
                    aria-label={`${group.label} 하위 메뉴 ${expanded ? "접기" : "펼치기"}`}
                    title={expanded ? "접기" : "펼치기"}
                    className="w-8 h-8 mr-1 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <Icon
                      name="expand_more"
                      className={`text-base transition-transform duration-200 ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </div>

              {expanded && (
                <div className="ml-4 pl-3 border-l border-border-subtle flex flex-col gap-1 mb-1">
                  {group.items.map((item, i) => {
                    const showSection = item.section && item.section !== group.items[i - 1]?.section;
                    return (
                      <div key={item.href}>
                        {showSection && (
                          <p className="px-3 mt-3 mb-1 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                            {item.section}
                          </p>
                        )}
                        <Link
                          href={item.href}
                          className={`${LINK_BASE} py-2 text-[15px] ${
                            isActive(pathname, item)
                              ? `${ACCENT_STYLE[group.accent].solid} font-bold translate-x-1`
                              : "text-on-surface-variant hover:bg-surface-container-high"
                          }`}
                        >
                          <Icon name={item.icon} className="text-base" />
                          <span>{item.label}</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
