"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon } from "@/shared/components/ui";
import { EQUIPMENT_FIELDS } from "@/shared/lib/equipmentMeta";
import BranchOverview from "./BranchOverview";
import LongTermPlan from "./LongTermPlan";
import EquipmentCrud from "./EquipmentCrud";

/**
 * 설비 마스터 — 첫 화면은 전 지사 개요다.
 *
 * 오버홀처럼 지사 관문으로 막지 않는 이유: 여기서는 "어느 지사가 어디까지
 * 왔는지"를 한눈에 보다가 지사를 골라 들어가는 흐름이 자연스럽기 때문.
 * 다만 선택 자체는 오버홀과 같은 쿠키(oh_branch, /api/overhaul/branch)에
 * 저장한다 — 여기서 고른 지사가 보수계획·회차·실적 화면까지 그대로 이어진다.
 *
 * 지사를 고르면: 장기 유지보수 계획(과거 2년~향후 4년) + 설비·기기 CRUD.
 */
export default function EquipmentMaster() {
  /** undefined = 아직 조회 전(깜빡임 방지), null = 선택 전 */
  const [branch, setBranch] = useState<string | null | undefined>(undefined);
  const [branches, setBranches] = useState<string[]>([]);
  const [view, setView] = useState<"overview" | "branch">("overview");
  const [switching, setSwitching] = useState(false);
  /** 설비 CRUD가 바뀌면 장기 계획 표를 다시 그리기 위한 키 */
  const [planVersion, setPlanVersion] = useState(0);
  /** 분야(기계·전기·제어…) 필터 — null이면 전체. 장기 계획·설비 목록에 함께 적용된다. */
  const [fieldFilter, setFieldFilter] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const json = await (await fetch("/api/overhaul/branch")).json();
        if (json.ok) {
          // 지사가 이미 선택돼 있어도 첫 화면은 항상 전 지사 개요다 —
          // "계속 보기" 버튼으로 바로 들어갈 수 있다.
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
        setView("branch");
        setPlanVersion((v) => v + 1);
      }
    } finally {
      setSwitching(false);
    }
  }, []);

  if (branch === undefined) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  // ── 전 지사 개요 ─────────────────────────────────────────────────────────
  if (view === "overview" || !branch) {
    return (
      <>
        {/* 모바일 — 챕터 이름("설비 관리")을 가운데, 설명은 개조식 bullet로 */}
        <div className="md:hidden text-center pt-2">
          <h1 className="text-title-sm font-black text-on-surface">설비 관리</h1>
          <ul className="mt-2 inline-block text-left">
            {[
              "지사별 최근 오버홀 현황 확인",
              "지사 선택 시 장기 보수계획·설비정보 관리",
              "선택한 지사는 보수계획·회차·실적까지 연동",
            ].map((b) => (
              <li key={b} className="flex gap-1.5 text-sm text-on-surface-variant py-0.5">
                <span className="text-on-surface-variant/50">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {branch && (
            <div className="mt-3">
              <Button variant="ghost" className="w-full" onClick={() => setView("branch")}>
                <Icon name="arrow_forward" className="text-base" />
                {branch} 계속 보기
              </Button>
            </div>
          )}
        </div>

        {/* 데스크톱 */}
        <div className="hidden md:flex md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg text-on-surface pt-2">설비 마스터</h1>
            <p className="text-body-md text-on-surface-variant mt-2">
              지사별 최근 오버홀 현황입니다. 지사를 고르면 그 지사의 장기 유지보수 계획과
              설비·기기 정보를 관리합니다 — 여기서 고른 지사는 보수계획·회차·실적 화면에도
              그대로 이어집니다.
            </p>
          </div>
          {branch && (
            <Button variant="ghost" onClick={() => setView("branch")}>
              <Icon name="arrow_forward" className="text-base" />
              {branch} 계속 보기
            </Button>
          )}
        </div>
        <BranchOverview current={branch ?? null} busy={switching} onPick={(b) => void pick(b)} />
      </>
    );
  }

  // ── 지사 선택 후: 지사 띠 + 장기 계획 + 설비 CRUD ────────────────────────
  return (
    <>
      {/* 모바일 */}
      <div className="md:hidden text-center pt-2">
        <h1 className="text-title-sm font-black text-on-surface">설비 관리</h1>
        <ul className="mt-2 inline-block text-left">
          {[
            "지사의 장기 보수계획·설비 기준정보 관리",
            "직접 등록 또는 엑셀 업로드로 설비 자동 등록",
          ].map((b) => (
            <li key={b} className="flex gap-1.5 text-sm text-on-surface-variant py-0.5">
              <span className="text-on-surface-variant/50">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 데스크톱 */}
      <div className="hidden md:flex md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface pt-2">설비 마스터</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            이 지사의 장기 유지보수 계획과 설비·기기 기준 정보입니다. 설비는 직접 추가하거나
            보수계획·오버홀 엑셀 업로드로 자동 등록됩니다.
          </p>
        </div>
      </div>

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
          설비·보수계획·회차·실적이 이 지사 것만 보입니다
        </span>
        <span className="h-5 w-px bg-border-subtle hidden md:block" aria-hidden />
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
            <Icon name="category" className="text-base" />
            분야
          </span>
          {[null, ...EQUIPMENT_FIELDS].map((f) => (
            <button
              key={f ?? "all"}
              type="button"
              onClick={() => setFieldFilter(f)}
              className={`px-2.5 h-7 rounded-full text-xs font-bold border transition-colors ${
                fieldFilter === f
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:border-primary hover:text-primary"
              }`}
            >
              {f ?? "전체"}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setView("overview")}
          className="ml-auto flex items-center gap-1 text-sm font-bold text-primary hover:underline"
        >
          <Icon name="grid_view" className="text-base" />전 지사 개요
        </button>
      </div>

      <LongTermPlan key={`${branch}:${planVersion}`} branch={branch} fieldFilter={fieldFilter} />

      <EquipmentCrud
        key={branch}
        fieldFilter={fieldFilter}
        onChanged={() => setPlanVersion((v) => v + 1)}
      />
    </>
  );
}
