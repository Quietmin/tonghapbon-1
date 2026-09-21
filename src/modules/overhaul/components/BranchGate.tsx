"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/shared/components/ui";

/**
 * 오버홀 화면의 지사 관문.
 *
 * 유지보수 업무는 지사별로 독립 운영되므로, 오버홀에 들어오면 먼저 지사를
 * 고르게 하고 그 뒤의 모든 화면(보수계획·회차·실적·이력)을 그 지사 데이터로
 * 좁힌다. 선택은 쿠키(oh_branch)에 담겨 서버가 읽는다 (activeBranch.ts).
 *
 * 기본 지사를 깔지 않는 이유: 기본값이 있으면 다른 지사 사람이 그걸 못 보고
 * 남의 지사에 실적을 쌓는다. 처음 한 번 고르면 1년짜리 쿠키라 다시 묻지 않는다.
 */
export default function BranchGate({ children }: { children: React.ReactNode }) {
  /** undefined = 아직 조회 전(깜빡임 방지), null = 선택 전 */
  const [branch, setBranch] = useState<string | null | undefined>(undefined);
  const [branches, setBranches] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const json = await (await fetch("/api/overhaul/branch")).json();
        if (json.ok) {
          setBranch(json.branch);
          setBranches(json.branches);
        } else {
          setBranch(null);
        }
      } catch {
        setBranch(null);
      }
    })();
  }, []);

  const pick = useCallback(async (next: string) => {
    setSwitching(true);
    try {
      const json = await (
        await fetch("/api/overhaul/branch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ branch: next }),
        })
      ).json();
      if (json.ok) {
        setBranch(json.branch);
        // 오버홀의 모든 데이터가 지사에 매여 있다 — 통째로 다시 읽는다
        window.location.reload();
      }
    } finally {
      setSwitching(false);
    }
  }, []);

  if (branch === undefined) return null;

  // ── 선택 전: 지사 선택 화면이 오버홀 콘텐츠를 대신한다 ──────────────────────
  if (branch === null) {
    const sorted = [...branches].sort((a, b) => a.localeCompare(b, "ko"));
    return (
      <div className="max-w-3xl">
        <h1 className="text-display-lg text-on-surface pt-2">지사 선택</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          유지보수 업무는 지사별로 따로 운영됩니다. 소속 지사를 고르면 보수계획·회차·실적
          이력이 모두 그 지사 것만 보입니다. 한 번 고르면 기억되고, 위쪽 지사 표시에서
          언제든 바꿀 수 있습니다.
        </p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {sorted.map((b) => (
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
      </div>
    );
  }

  // ── 선택 후: 지사 띠 + 원래 화면 ────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-container-low px-4 py-2">
        <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
          <Icon name="apartment" className="text-base" />
          지사
        </span>
        <select
          value={branch}
          disabled={switching}
          onChange={(e) => void pick(e.target.value)}
          className="h-8 px-3 rounded-lg bg-surface-container-lowest border border-border-subtle text-sm font-bold outline-none focus:border-primary disabled:opacity-50"
        >
          {[...branches].sort((a, b) => a.localeCompare(b, "ko")).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <span className="text-xs text-on-surface-variant">
          보수계획·회차·실적이 이 지사 것만 보입니다
        </span>
      </div>
      {children}
    </>
  );
}
