"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "dashboard", iconFilled: false },
  {
    href: "/history",
    label: "고장이력",
    icon: "history_edu",
    iconFilled: true,
    match: (path: string) =>
      (path.startsWith("/history") && !path.startsWith("/history/bulk-upload")) || path === "/export-success",
  },
  { href: "/equipment", label: "설비목록", icon: "settings_input_component", iconFilled: false },
  { href: "/history/bulk-upload", label: "고장상보 일괄등록", icon: "upload_file", iconFilled: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    item.match ? item.match(pathname) : pathname === item.href;

  const handleReset = async () => {
    const confirmed = window.confirm(
      "정말 전체 리셋하시겠습니까?\n\n등록된 모든 고장이력과 첨부파일이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.",
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) throw new Error("reset failed");
      router.push("/");
      router.refresh();
    } catch {
      window.alert("리셋 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-sidebar-width bg-primary flex flex-col p-gutter border-r border-outline-variant z-50">
      <div className="text-title-sm font-title-sm font-bold text-on-primary mb-stack-lg flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
          factory
        </span>
        <span>Plant Ops Manager</span>
      </div>
      <nav className="flex flex-col gap-2 flex-grow">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-stack-md rounded-lg border-l-4 px-4 py-3 transition-all ${
                active
                  ? "border-inverse-primary bg-white/10 text-on-primary scale-[0.98]"
                  : "border-transparent text-on-primary/70 hover:text-on-primary hover:bg-white/5"
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={item.iconFilled ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="font-label-caps text-label-caps">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-on-primary/10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center overflow-hidden border border-outline-variant text-on-secondary-container font-bold">
            김
          </div>
          <div>
            <p className="text-on-primary text-body-sm font-bold">김관리 매니저</p>
            <p className="text-on-primary/60 text-[11px]">열원설비 관리 시스템</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg border border-status-critical/40 px-3 py-2 text-status-critical/90 hover:bg-status-critical/10 hover:text-status-critical transition-all text-body-sm font-bold disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">{resetting ? "hourglass_top" : "restart_alt"}</span>
          {resetting ? "리셋 중..." : "전체 리셋"}
        </button>
      </div>
    </aside>
  );
}
