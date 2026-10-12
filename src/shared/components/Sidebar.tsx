"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ACCENT_STYLE, Icon } from "./ui";
import { NAV_GROUPS, isActive, type NavGroup } from "@/shared/lib/nav";
import { useChatbotDock } from "./ChatbotDock";
import { useSidebar } from "./SidebarState";

const LINK_BASE =
  "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-body-md";

/* 챕터 색은 nav.ts 가 들고 있다 — 사이드바는 그 값을 읽어 칠하기만 한다 */
const GROUP_ACTIVE = {
  primary: "text-primary",
  tertiary: "text-tertiary",
} as const;

/** 펼쳐 둔 챕터 — 새로고침해도 유지한다 */
const STORAGE_KEY = "sidebar-open-groups";

/** 지금 보고 있는 화면이 속한 챕터 (대표 경로 밖의 하위 메뉴까지 본다) */
function activeGroupKey(pathname: string): NavGroup["key"] | null {
  const g = NAV_GROUPS.find(
    (group) =>
      pathname === group.root ||
      pathname.startsWith(`${group.root}/`) ||
      group.items.some((it) => isActive(pathname, it)),
  );
  return g?.key ?? null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const dock = useChatbotDock();
  const sidebar = useSidebar();

  /*
   * 펼친 챕터들. 처음에는 지금 있는 챕터만 펼친다 — 서버와 브라우저가 같은
   * pathname 을 보므로 첫 렌더가 어긋나지 않는다. 저장값은 마운트 뒤에 덮어쓴다.
   */
  const [openKeys, setOpenKeys] = useState<NavGroup["key"][]>(() => {
    const key = activeGroupKey(pathname);
    return key ? [key] : [];
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const keys = JSON.parse(saved) as unknown;
      if (!Array.isArray(keys)) return;
      const valid = NAV_GROUPS.map((g) => g.key);
      setOpenKeys(keys.filter((k): k is NavGroup["key"] => valid.includes(k as NavGroup["key"])));
    } catch {
      /* 저장소를 못 읽어도 기본값(지금 챕터만 펼침)으로 그냥 동작한다 */
    }
  }, []);

  const save = useCallback((keys: NavGroup["key"][]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {
      /* 저장 실패는 이번 세션에서만 상태가 안 남는 정도라 무시한다 */
    }
  }, []);

  /*
   * 다른 챕터로 넘어가면 그 챕터를 펼친다. 접힌 채로 두면 방금 누른 메뉴가
   * 어디 있는지 보이지 않는다. 다른 챕터는 건드리지 않는다 — 사용자가 일부러
   * 펼쳐 둔 것일 수 있다.
   */
  useEffect(() => {
    const key = activeGroupKey(pathname);
    if (!key) return;
    setOpenKeys((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      save(next);
      return next;
    });
  }, [pathname, save]);

  function toggleGroup(key: NavGroup["key"]) {
    setOpenKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      save(next);
      return next;
    });
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
        <Link href="/" className="flex items-center gap-3 px-2 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shrink-0">
            <Icon name="factory" />
          </div>
          <div className="min-w-0">
            <h1 className="text-title-sm font-black text-on-surface leading-tight truncate">
              유지보수 마스터
            </h1>
            <p className="text-xs text-on-surface-variant truncate">설비 · 고장 · 매뉴얼</p>
          </div>
        </Link>
        {/* 숨긴 뒤 다시 부르는 곳은 헤더의 같은 버튼뿐이다 */}
        <button
          type="button"
          onClick={() => sidebar.setOpen(false)}
          aria-label="메뉴 숨기기"
          title="메뉴 숨기기"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          <Icon name="menu_open" />
        </button>
      </div>

      {/* 어느 화면에서든 첫 화면으로 돌아가는 버튼 */}
      <Link
        href="/"
        className={`${LINK_BASE} mb-3 shrink-0 ${
          pathname === "/"
            ? "bg-primary-container text-on-primary font-bold"
            : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
        }`}
      >
        <Icon name="home" className="text-lg" />
        <span>처음 화면으로</span>
      </Link>

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
          const expanded = hasItems && openKeys.includes(group.key);

          return (
            <div key={group.key} className="flex flex-col gap-1">
              {/*
                제목을 누르면 챕터 첫 화면으로 가고, 화살표를 누르면 펼치고 접는다.
                한 버튼에 둘을 묶으면 "메뉴만 보려는데 화면이 바뀌는" 일이 생긴다.
              */}
              <div
                className={`flex items-center justify-between rounded-lg font-bold text-body-md ${
                  groupActive ? GROUP_ACTIVE[group.accent] : "text-on-surface"
                }`}
              >
                <Link
                  href={group.root}
                  className="flex items-center gap-3 min-w-0 flex-1 px-4 py-2.5 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <Icon name={group.icon} className="text-lg shrink-0" />
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
                          <p className="px-3 mt-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                            {item.section}
                          </p>
                        )}
                        <Link
                          href={item.href}
                          className={`${LINK_BASE} py-2 text-sm ${
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

      {/* 챗봇은 메뉴가 아니라 떠 있는 도크다 — 여기서는 여는 버튼만 둔다 */}
      <div className="mt-auto pt-4 border-t border-border-subtle shrink-0">
        <button
          type="button"
          onClick={dock.open}
          className={`${LINK_BASE} w-full text-on-surface-variant hover:bg-surface-container-high`}
        >
          <Icon name="smart_toy" className="text-lg" />
          <span>정비 챗봇 열기</span>
        </button>
      </div>
    </aside>
  );
}
