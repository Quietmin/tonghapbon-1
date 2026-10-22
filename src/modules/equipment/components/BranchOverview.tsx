"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState, Icon } from "@/shared/components/ui";
import type { BranchOverviewRow } from "@/modules/equipment/lib/overviewRepo";

/**
 * 전 지사 개요 — 설비 마스터의 첫 화면.
 * 지사마다 최근 오버홀이 어디까지 왔는지 한 줄씩 보여주고,
 * 줄을 클릭하면 그 지사가 활성 지사(oh_branch)로 선택된다.
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
      <Card className="p-4 border border-error/30" lift={false}>
        <p className="text-sm text-error flex items-center gap-2">
          <Icon name="error" className="text-base" />
          {error}
        </p>
      </Card>
    );
  }

  if (!items) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  if (items.length === 0) {
    return <EmptyState icon="apartment" title="지사 정보가 없습니다" desc="" />;
  }

  const th = "py-3 text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest";

  return (
    <Card lift={false} className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[820px]">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className={`${th} pl-card-padding`}>지사</th>
              <th className={th}>설비</th>
              <th className={th}>최근 회차</th>
              <th className={th}>회차 기간</th>
              <th className={th}>최근 작업실적</th>
              <th className={th}>보수 이력</th>
              <th className={`${th} pr-card-padding`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {items.map((r) => {
              const active = r.branch === current;
              return (
                <tr
                  key={r.branch}
                  onClick={() => !busy && onPick(r.branch)}
                  className={`cursor-pointer transition-colors ${
                    active ? "bg-primary-container/30" : "hover:bg-surface-container-low"
                  }`}
                >
                  <td className="py-3 pl-card-padding text-sm font-bold text-on-surface">
                    <span className="flex items-center gap-2">
                      <Icon name="apartment" className="text-base text-on-surface-variant" />
                      {r.branch}
                      {active && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary">
                          보는 중
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-on-surface">
                    {r.equipmentCount ? `${r.equipmentCount}개` : "—"}
                  </td>
                  <td className="py-3 text-sm text-on-surface max-w-[200px] truncate">
                    {r.latestProject?.name ?? "—"}
                  </td>
                  <td className="py-3 text-sm text-on-surface-variant font-mono-data">
                    {r.latestProject?.start_date
                      ? `${r.latestProject.start_date} ~ ${r.latestProject.end_date ?? ""}`
                      : "—"}
                  </td>
                  <td className="py-3 text-sm text-on-surface-variant font-mono-data">
                    {r.lastEntryDate ?? "—"}
                  </td>
                  <td className="py-3 text-sm text-on-surface-variant">
                    {r.lastDoneYear ? `${r.lastDoneYear}년` : "—"}
                  </td>
                  <td className="py-3 pr-card-padding text-right">
                    <Icon name="chevron_right" className="text-base text-on-surface-variant" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
