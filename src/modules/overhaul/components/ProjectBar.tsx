"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/shared/components/ui";
import type { OverhaulProject } from "../lib/repo";

/**
 * 지금 보고 있는 오버홀 회차를 띠 하나로 보여주고, 골라서 바꾼다.
 *
 * 공정관리 화면(대시보드·작업·공정표·실적·보고서·사진)은 모두 회차 하나에 매여
 * 있어서, 어느 회차를 보고 있는지 늘 보여야 한다. 회차를 바꾸면 서버가 쿠키를
 * 갈아주므로 화면은 데이터를 다시 읽기만 하면 된다.
 *
 * 보수계획(/overhaul/plan)은 회차에 매이지 않는 계약 전 단계라 이 띠를 안 쓴다
 * (app/overhaul/layout.tsx에서 걸러낸다).
 */
export default function ProjectBar() {
  const router = useRouter();
  const [projects, setProjects] = useState<OverhaulProject[]>([]);
  const [active, setActive] = useState<OverhaulProject | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const json = await (await fetch("/api/overhaul/project")).json();
    if (json.ok) {
      setActive(json.project);
      setProjects(json.projects);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = useCallback(
    async (id: string) => {
      if (!id || id === active?.id) return;
      setSwitching(true);
      try {
        const json = await (
          await fetch("/api/overhaul/project/active", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id }),
          })
        ).json();
        if (json.ok) {
          setActive(json.project);
          // 이 페이지의 데이터는 전부 회차에 매여 있다 — 통째로 다시 읽는다
          router.refresh();
          window.location.reload();
        }
      } finally {
        setSwitching(false);
      }
    },
    [active?.id, router],
  );

  if (!active) return null;

  const period =
    active.start_date && active.end_date
      ? `${active.start_date} ~ ${active.end_date}`
      : "계약기간 미설정";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-container-low px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-label-caps uppercase text-on-surface-variant">
        <Icon name="engineering" className="text-base" />
        회차
      </span>

      {projects.length > 1 ? (
        <select
          value={active.id}
          disabled={switching}
          onChange={(e) => void pick(e.target.value)}
          className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-border-subtle text-sm font-bold outline-none focus:border-primary disabled:opacity-50"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.unit ? ` · ${p.unit}` : ""}
              {p.start_date ? ` (${p.start_date.slice(0, 4)})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm font-bold text-on-surface">
          {active.name}
          {active.unit ? ` · ${active.unit}` : ""}
        </span>
      )}

      <span
        className={`text-xs font-semibold ${
          active.start_date && active.end_date ? "text-on-surface-variant" : "text-status-warning"
        }`}
      >
        {period}
      </span>

      <Link
        href="/overhaul/project"
        className="ml-auto flex items-center gap-1 text-xs font-bold text-primary hover:underline"
      >
        <Icon name="settings" className="text-sm" />
        회차 관리
      </Link>
    </div>
  );
}
