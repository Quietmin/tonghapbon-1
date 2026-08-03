"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Icon, Button } from "@/shared/components/ui";
import type { OverhaulProject } from "../lib/repo";

/**
 * 프로젝트와 계약기간 설정.
 * 계약기간이 있어야 경과일·계획 공정률·지연 위험이 계산된다. 없으면 전부 0으로 나온다.
 */
export default function ProjectSettings() {
  const [p, setP] = useState<OverhaulProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const json = await (await fetch("/api/overhaul/project")).json();
      if (json.ok) setP(json.project);
    })();
  }, []);

  const save = useCallback(async () => {
    if (!p) return;
    setSaving(true);
    setSaved(false);
    const json = await (
      await fetch("/api/overhaul/project", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      })
    ).json();
    if (json.ok) {
      setP(json.project);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }, [p]);

  if (!p) return null;
  const set = (k: keyof OverhaulProject) => (v: string) => setP({ ...p, [k]: v });
  const missingPeriod = !p.start_date || !p.end_date;

  return (
    <Card className="p-card-padding" lift={false}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="event" className="text-base text-primary" />
          프로젝트 · 계약기간
        </h2>
        {missingPeriod && (
          <span className="text-xs font-bold text-status-warning">
            계약기간을 넣어야 경과일·지연 위험이 계산됩니다
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-on-surface-variant">프로젝트명</span>
          <input className="input" value={p.name ?? ""} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-on-surface-variant">발전소</span>
          <input className="input" value={p.plant ?? ""} onChange={(e) => set("plant")(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-on-surface-variant">호기</span>
          <input className="input" value={p.unit ?? ""} onChange={(e) => set("unit")(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-on-surface-variant">착수일</span>
          <input
            type="date"
            className="input"
            value={p.start_date ?? ""}
            onChange={(e) => set("start_date")(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-caps uppercase text-on-surface-variant">준공 예정일</span>
          <input
            type="date"
            className="input"
            value={p.end_date ?? ""}
            onChange={(e) => set("end_date")(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Button onClick={save} disabled={saving}>
          <Icon name="save" className="text-base" />
          {saving ? "저장 중…" : "저장"}
        </Button>
        {saved && (
          <span className="text-sm text-status-success font-bold flex items-center gap-1">
            <Icon name="check_circle" className="text-base" />
            저장했습니다
          </span>
        )}
      </div>
    </Card>
  );
}
