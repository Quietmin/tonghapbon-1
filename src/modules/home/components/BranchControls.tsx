"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRANCHES } from "@/shared/lib/branches";
import { Icon } from "@/shared/components/ui";

/**
 * 처음 화면의 지사 선택 — 설비관리의 BranchGate 와 같은 쿠키(oh_branch)를 같은 API 로 바꾼다.
 * 어느 쪽에서 골라도 설비관리·처음 화면 모두에 이어진다. 바꾼 뒤에는 서버 컴포넌트가 새 쿠키로
 * 다시 그려지도록 router.refresh() 만 부른다(전체 새로고침 불필요).
 */
const SORTED = [...BRANCHES].sort((a, b) => a.localeCompare(b, "ko"));

function useBranchSwitch() {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function pick(next: string) {
    setSwitching(true);
    try {
      const res = await fetch("/api/overhaul/branch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branch: next }),
      });
      const json = await res.json();
      if (json.ok) router.refresh();
    } finally {
      setSwitching(false);
    }
  }
  return { pick, switching };
}

/** 지사를 아직 고르지 않았을 때 대시보드 자리에 뜨는 선택 화면 */
export function BranchGrid() {
  const { pick, switching } = useBranchSwitch();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {SORTED.map((b) => (
        <button
          key={b}
          type="button"
          disabled={switching}
          onClick={() => void pick(b)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border-subtle bg-surface-container-low text-sm font-bold text-on-surface hover:border-primary hover:bg-primary-container/30 transition-colors disabled:opacity-50"
        >
          <Icon name="apartment" className="text-base text-on-surface-variant" />
          {b}
        </button>
      ))}
    </div>
  );
}
