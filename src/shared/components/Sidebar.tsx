"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { NAV_GROUPS, isActive } from "@/shared/lib/nav";
import { useChatbotDock } from "./ChatbotDock";

const LINK_BASE =
  "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-body-md";

export default function Sidebar() {
  const pathname = usePathname();
  const dock = useChatbotDock();

  return (
    <aside className="hidden md:flex flex-col p-4 gap-2 h-screen fixed left-0 top-0 w-[280px] bg-surface-container border-r border-border-subtle z-50 overflow-y-auto">
      <Link href="/" className="flex items-center gap-3 px-2 mb-4 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary">
          <Icon name="factory" />
        </div>
        <div>
          <h1 className="text-title-sm font-black text-on-surface leading-tight">유지보수 마스터</h1>
          <p className="text-xs text-on-surface-variant">설비 · 고장 · 매뉴얼</p>
        </div>
      </Link>

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

      {/* 메인 메뉴 3개 — 클릭한 그룹만 하위 항목이 펼쳐진다 */}
      <nav className="flex-1 flex flex-col gap-1">
        {NAV_GROUPS.map((group) => {
          // 대표 경로 밖의 하위 메뉴도 있다 (설비관리 챕터의 /overhaul 화면들) —
          // root 접두사만 보면 그 화면에서 챕터가 접혀 버리므로 항목까지 본다.
          const groupActive =
            pathname === group.root ||
            pathname.startsWith(`${group.root}/`) ||
            group.items.some((it) => isActive(pathname, it));
          // 하위가 대표 경로 하나뿐이면 펼쳐도 같은 링크가 두 번 나올 뿐이라 접어 둔다
          const showItems =
            groupActive && !(group.items.length === 1 && group.items[0].href === group.root);
          return (
            <div key={group.key} className="flex flex-col gap-1">
              <Link
                href={group.root}
                className={`${LINK_BASE} justify-between font-bold ${
                  groupActive
                    ? "text-primary"
                    : "text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon name={group.icon} className="text-lg" />
                  {group.label}
                </span>
                <Icon
                  name={groupActive ? "expand_more" : "chevron_right"}
                  className="text-base text-on-surface-variant"
                />
              </Link>

              {showItems && (
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
                              ? "bg-primary-container text-on-primary font-bold translate-x-1"
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
