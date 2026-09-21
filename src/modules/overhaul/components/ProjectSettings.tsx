"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Icon, Button, EmptyState } from "@/shared/components/ui";
import type { OverhaulProject } from "../lib/repo";

/**
 * 오버홀 회차 관리 — 만들고, 고치고, 바꿔 보고, 지운다.
 *
 * 회차는 여러 개다. 2026년 1호기와 2027년 1호기는 계약도 내역서도 실적도 다른
 * 별개의 일이므로, 한 회차에 덮어쓰지 않고 나란히 남긴다. 지금 보고 있는 회차는
 * 서버가 쿠키로 기억한다(activeProject.ts).
 *
 * 계약기간(착수일~준공예정일)이 있어야 경과일·계획 공정률·지연 위험이 계산된다.
 * 비어 있으면 그 회차의 지표가 전부 0으로 나오므로 눈에 띄게 표시한다.
 */

type Draft = Pick<OverhaulProject, "name" | "plant" | "unit" | "start_date" | "end_date">;

const EMPTY_DRAFT: Draft = {
  name: "",
  plant: "",
  unit: "",
  start_date: "",
  end_date: "",
};

function FieldRow({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-on-surface-variant">회차명</span>
        <input
          className="input"
          placeholder="2026년 정기 오버홀"
          value={draft.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-on-surface-variant">발전소</span>
        <input
          className="input"
          value={draft.plant ?? ""}
          onChange={(e) => onChange({ plant: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-on-surface-variant">호기</span>
        <input
          className="input"
          value={draft.unit ?? ""}
          onChange={(e) => onChange({ unit: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-on-surface-variant">착수일</span>
        <input
          type="date"
          className="input"
          value={draft.start_date ?? ""}
          onChange={(e) => onChange({ start_date: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label-caps uppercase text-on-surface-variant">준공 예정일</span>
        <input
          type="date"
          className="input"
          value={draft.end_date ?? ""}
          onChange={(e) => onChange({ end_date: e.target.value })}
        />
      </label>
    </div>
  );
}

export default function ProjectSettings() {
  const [projects, setProjects] = useState<OverhaulProject[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [creating, setCreating] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const json = await (await fetch("/api/overhaul/project")).json();
    if (json.ok) {
      setProjects(json.projects);
      setActiveId(json.project.id);
      setEditing({});
    } else setError(json.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const draftOf = (p: OverhaulProject): Draft =>
    editing[p.id] ?? {
      name: p.name,
      plant: p.plant ?? "",
      unit: p.unit ?? "",
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
    };

  const patchDraft = (id: string, patch: Partial<Draft>, base: Draft) =>
    setEditing((prev) => ({ ...prev, [id]: { ...base, ...patch } }));

  const save = async (p: OverhaulProject) => {
    const draft = editing[p.id];
    if (!draft) return;
    setBusy(p.id);
    setError(null);
    try {
      const json = await (
        await fetch("/api/overhaul/project", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: p.id, ...draft }),
        })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      setProjects(json.projects);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setSavedId(p.id);
      setTimeout(() => setSavedId(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!creating?.name?.trim()) {
      setError("회차명을 입력하세요.");
      return;
    }
    setBusy("new");
    setError(null);
    try {
      const json = await (
        await fetch("/api/overhaul/project", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(creating),
        })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "만들지 못했습니다.");
      setCreating(null);
      // 새 회차가 곧바로 활성이 된다 — 화면 전체를 그 회차 기준으로 다시 읽는다
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string) => {
    setBusy(id);
    try {
      const json = await (
        await fetch("/api/overhaul/project/active", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        })
      ).json();
      if (json.ok) window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: OverhaulProject) => {
    if (
      !confirm(
        `"${p.name}" 회차를 지웁니다.\n\n이 회차의 업로드 이력·작업항목·실적·사진이 모두 함께 삭제되고 되돌릴 수 없습니다.\n보수계획(계약 전)과 이미 반영된 보수 이력은 남습니다.`,
      )
    ) {
      return;
    }
    setBusy(p.id);
    setError(null);
    try {
      const json = await (
        await fetch(`/api/overhaul/project?id=${p.id}`, { method: "DELETE" })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      if (p.id === activeId) window.location.reload();
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!projects) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface pt-2">회차 관리</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            오버홀 회차를 만들고 계약기간을 정합니다. 회차마다 작업항목·실적·사진이 따로
            쌓이므로, 새 오버홀은 기존 회차를 고치지 말고 새로 만드세요.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating({ ...EMPTY_DRAFT })}>
            <Icon name="add" className="text-base" />
            새 회차
          </Button>
        )}
      </div>

      {error && (
        <Card className="p-4 border border-error/30" lift={false}>
          <p className="text-sm text-error flex items-center gap-2">
            <Icon name="error" className="text-base" />
            {error}
          </p>
        </Card>
      )}

      {creating && (
        <Card className="p-card-padding border border-primary/30" lift={false}>
          <h2 className="text-title-sm text-on-surface flex items-center gap-2 mb-4">
            <Icon name="add_circle" className="text-base text-primary" />
            새 회차 만들기
          </h2>
          <FieldRow draft={creating} onChange={(patch) => setCreating({ ...creating, ...patch })} />
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={create} disabled={busy === "new"}>
              <Icon name="check" className="text-base" />
              {busy === "new" ? "만드는 중…" : "만들고 이 회차로 이동"}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(null)}>
              취소
            </Button>
          </div>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card lift={false} className="p-0">
          <EmptyState icon="engineering" title="회차가 없습니다" desc="'새 회차'로 시작하세요." />
        </Card>
      ) : (
        projects.map((p) => {
          const draft = draftOf(p);
          const dirty = !!editing[p.id];
          const isActive = p.id === activeId;
          const missingPeriod = !p.start_date || !p.end_date;

          return (
            <Card
              key={p.id}
              lift={false}
              className={`p-card-padding ${isActive ? "border border-primary/40" : ""}`}
            >
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h2 className="text-title-sm text-on-surface flex items-center gap-2">
                  <Icon
                    name={isActive ? "radio_button_checked" : "radio_button_unchecked"}
                    className={`text-base ${isActive ? "text-primary" : "text-on-surface-variant"}`}
                  />
                  {p.name}
                  {isActive && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      보고 있는 회차
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {missingPeriod && (
                    <span className="text-xs font-bold text-status-warning">
                      계약기간을 넣어야 경과일·지연 위험이 계산됩니다
                    </span>
                  )}
                  {!isActive && (
                    <Button variant="ghost" onClick={() => activate(p.id)} disabled={!!busy}>
                      <Icon name="login" className="text-base" />
                      이 회차 보기
                    </Button>
                  )}
                  <button
                    onClick={() => remove(p)}
                    disabled={!!busy || projects.length <= 1}
                    title={
                      projects.length <= 1
                        ? "마지막 회차는 지울 수 없습니다"
                        : "이 회차와 딸린 자료 전체 삭제"
                    }
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Icon name="delete" className="text-lg" />
                  </button>
                </div>
              </div>

              <FieldRow draft={draft} onChange={(patch) => patchDraft(p.id, patch, draft)} />

              <div className="flex items-center gap-3 mt-4">
                <Button onClick={() => save(p)} disabled={!dirty || busy === p.id}>
                  <Icon name="save" className="text-base" />
                  {busy === p.id ? "저장 중…" : "저장"}
                </Button>
                {savedId === p.id && (
                  <span className="text-sm text-status-success font-bold flex items-center gap-1">
                    <Icon name="check_circle" className="text-base" />
                    저장했습니다
                  </span>
                )}
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}
