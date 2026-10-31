"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState, Icon, LoadingState, ErrorState } from "@/shared/components/ui";
import type { BranchOverviewRow } from "@/modules/equipment/lib/overviewRepo";
import BranchMap from "./BranchMap";

/**
 * 전 지사 개요 — 설비 마스터의 첫 화면.
 *
 * 화면 왼쪽 절반은 지사마다 정사각형 박스(아이콘 + 지사명만 — 글자는 크게), 오른쪽 절반은
 * 모든 지사 위치를 한 장에 보여 주는 약식 지도다. 박스나 지도의 점을 누르면 그 지사가 활성 지사(oh_branch)로
 * 선택된다. 마우스를 올린 지사는 박스와 지도에서 함께 강조된다. 줄줄이 늘어선 표 대신 한눈에
 * 보이도록 바꿨다 — 데이터가 없는 지사도 박스는 나온다(거기서 지사를 골라 시작하므로). 설비 수·
 * 회차 같은 부가 글자는 박스에서 뺐다. 데이터 유무는 지도의 점(속이 찬/빈)으로 구분한다.
 */
export default function BranchOverview({
  current,
  busy,
  onPick,
}: {
  /** 지금 활성인 지사 (없으면 null) */
  current: string | null;
  busy: boolean;
  onPick: (branch: string) => void;
}) {
  const [items, setItems] = useState<BranchOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 박스·지도 어느 쪽이든 마우스를 올린(또는 포커스한) 지사 */
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const json = await (await fetch("/api/equipment/overview")).json();
        if (json.ok) setItems(json.items);
        else setError(json.error ?? "개요를 불러오지 못했습니다.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <ErrorState message={error} onRetry={() => window.location.reload()} />
    );
  }

  if (!items) {
    return <LoadingState />;
  }

  if (items.length === 0) {
    return <EmptyState icon="apartment" title="지사 정보가 없습니다" desc="" />;
  }

  return (
    <div className="grid gap-gutter lg:grid-cols-2 items-start">
      {/* 왼쪽 절반 — 정사각형 박스 */}
      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((r) => {
          const active = r.branch === current;
          const hot = r.branch === hovered;
          return (
            <button
              key={r.branch}
              type="button"
              disabled={busy}
              onClick={() => onPick(r.branch)}
              onMouseEnter={() => setHovered(r.branch)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(r.branch)}
              onBlur={() => setHovered(null)}
              aria-pressed={active}
              className={`aspect-square rounded-lg border p-2 flex flex-col justify-between text-left transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary-container/30"
                  : hot
                    ? "border-primary bg-primary-container/20 shadow-md ring-1 ring-primary/40"
                    : "border-border-subtle bg-surface-container-lowest hover:bg-surface-container-low"
              }`}
            >
              <Icon
                name="apartment"
                className={`text-xl ${active ? "text-primary" : "text-on-surface-variant"}`}
              />
              <span className="block text-[14px] font-bold text-on-surface leading-tight break-keep">
                {r.branch}
              </span>
            </button>
          );
        })}
      </div>

      {/* 오른쪽 절반 — 약식 지도(한 장에 전 지사) */}
      <Card lift={false} className="p-4 lg:sticky lg:top-20">
        <BranchMap
          items={items}
          current={current}
          hovered={hovered}
          busy={busy}
          onHover={setHovered}
          onPick={onPick}
        />
      </Card>
    </div>
  );
}
