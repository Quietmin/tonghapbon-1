"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Icon, Button } from "@/shared/components/ui";

/**
 * 준공 후 "이력 반영" — 확정했던 수량산출서를 실제 결과와 맞춰보고 보수계획의
 * 과거 이력(maintenance_record)으로 넘긴다.
 *
 * overhaul_task와 이름으로만 참고 매칭해서 완료 여부를 "제안"할 뿐, 확정은 항상
 * 사람이 한다 — 계약이 바뀌어 안 한 것과 시스템이 못 찾은 것을 구분할 수 없기 때문.
 */

type Outcome = "done" | "skipped" | "pending";

interface Candidate {
  itemId: number;
  planId: string | null;
  name: string;
  spec: string | null;
  grade: string | null;
  classification: string | null;
  suggestedTaskName: string | null;
  suggestedPlanQty: number | null;
  suggestedDoneQty: number | null;
  suggestedOutcome: "done" | "skipped" | null;
  existingStatus: "done" | "skipped" | null;
}

interface ExtraItem {
  planId: string;
  name: string;
  tagNo: string | null;
  category: string | null;
  grade: string;
}

const OUTCOME_LABEL: Record<Outcome, string> = { done: "완료", skipped: "안 함", pending: "보류" };
const OUTCOME_STYLE: Record<Outcome, string> = {
  done: "bg-status-success text-on-primary",
  skipped: "bg-surface-container-highest text-on-surface-variant",
  pending: "bg-surface-container-low text-on-surface-variant",
};

export default function StatementReconcile({
  statement,
  onClose,
  onDone,
}: {
  statement: { id: string; target_year: number; title: string | null; reconciled_at: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [decisions, setDecisions] = useState<Map<number, Outcome>>(new Map());
  const [grades, setGrades] = useState<Map<number, string>>(new Map());
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<
    { id: string; name: string; tag_no: string | null; category: string | null }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/overhaul/plan/reconcile?statementId=${statement.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (!json.ok) {
          setError(json.error);
          return;
        }
        setCandidates(json.candidates);
        const initDecisions = new Map<number, Outcome>();
        const initGrades = new Map<number, string>();
        for (const c of json.candidates as Candidate[]) {
          initDecisions.set(c.itemId, c.existingStatus ?? c.suggestedOutcome ?? "pending");
          if (c.grade) initGrades.set(c.itemId, c.grade);
        }
        setDecisions(initDecisions);
        setGrades(initGrades);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [statement.id]);

  useEffect(() => {
    const kw = addQuery.trim();
    if (!kw) {
      setAddResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/overhaul/plan/reconcile?q=${encodeURIComponent(kw)}`)
        .then((r) => r.json())
        .then((json) => alive && json.ok && setAddResults(json.results))
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [addQuery]);

  const pendingCount = useMemo(
    () => [...decisions.values()].filter((v) => v === "pending").length,
    [decisions],
  );
  const actionableCount = useMemo(
    () => [...decisions.values()].filter((v) => v !== "pending").length + extras.length,
    [decisions, extras],
  );

  const setOutcome = (itemId: number, outcome: Outcome) =>
    setDecisions((prev) => new Map(prev).set(itemId, outcome));

  const addExtra = (p: { id: string; name: string; tag_no: string | null; category: string | null }) => {
    if (extras.some((e) => e.planId === p.id)) return;
    setExtras((prev) => [...prev, { planId: p.id, name: p.name, tagNo: p.tag_no, category: p.category, grade: "" }]);
    setAddQuery("");
    setAddResults([]);
  };
  const removeExtra = (planId: string) => setExtras((prev) => prev.filter((e) => e.planId !== planId));

  const submit = async () => {
    if (!candidates) return;
    setSaving(true);
    setError(null);
    try {
      const decisionList = candidates
        .filter((c) => c.planId && decisions.get(c.itemId) !== "pending")
        .map((c) => ({
          planId: c.planId as string,
          outcome: decisions.get(c.itemId) as "done" | "skipped",
          grade: decisions.get(c.itemId) === "done" ? grades.get(c.itemId) ?? c.grade ?? null : null,
        }));
      const extraList = extras.map((e) => ({
        planId: e.planId,
        outcome: "done" as const,
        grade: e.grade || null,
        note: "계획에 없었으나 계약기간 중 추가로 시행",
      }));

      const res = await fetch("/api/overhaul/plan/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          statementId: statement.id,
          targetYear: statement.target_year,
          decisions: [...decisionList, ...extraList],
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "반영에 실패했습니다.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-card-padding" lift={false}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-title-sm text-on-surface">
          이력 반영 — {statement.title ?? `${statement.target_year}년도 내역서`}
        </h3>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-4">
        각 항목을 <b>완료 · 안 함 · 보류</b> 중 하나로 확인하세요. 제안은 공정관리 실적 이름을
        참고해 시스템이 짐작한 것일 뿐이니, 실제로 확인한 대로 눌러 주세요. 보류로 두면 이번엔
        반영하지 않고 다음에 다시 확인할 수 있습니다.
        {statement.reconciled_at && (
          <span className="block mt-1 text-status-warning">
            이미 {statement.reconciled_at.slice(0, 10)}에 반영된 내역서입니다 — 다시 반영하면 값을
            덮어씁니다.
          </span>
        )}
      </p>

      {error && (
        <p className="text-sm text-error mb-3 flex items-center gap-1.5">
          <Icon name="error" className="text-base" /> {error}
        </p>
      )}

      {!candidates ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">불러오는 중…</p>
      ) : (
        <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden">
          {candidates.map((c) => {
            const outcome = decisions.get(c.itemId) ?? "pending";
            return (
              <div key={c.itemId} className="flex items-center gap-3 px-4 py-3 bg-surface-container-lowest">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{c.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {c.spec ?? "—"}
                    {c.suggestedTaskName && (
                      <>
                        {" · 참고: "}
                        <span className="font-mono-data">{c.suggestedTaskName}</span>
                        {c.suggestedPlanQty != null && (
                          <> ({c.suggestedDoneQty ?? 0}/{c.suggestedPlanQty})</>
                        )}
                      </>
                    )}
                    {!c.suggestedTaskName && " · 매칭되는 공정관리 작업 없음"}
                  </p>
                </div>
                {outcome === "done" && (
                  <input
                    value={grades.get(c.itemId) ?? ""}
                    onChange={(e) => setGrades((prev) => new Map(prev).set(c.itemId, e.target.value))}
                    placeholder="등급"
                    className="w-14 h-8 px-2 rounded-lg bg-surface-container-low border border-border-subtle text-xs text-center outline-none focus:border-primary"
                  />
                )}
                <div className="flex gap-1 p-1 bg-surface-container-high rounded-lg">
                  {(["done", "skipped", "pending"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOutcome(c.itemId, o)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                        outcome === o ? OUTCOME_STYLE[o] : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-sm font-bold text-on-surface mb-2">계획에 없었으나 추가로 시행한 설비</h4>
        <div className="relative">
          <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-10 border border-transparent focus-within:border-primary transition-colors">
            <Icon name="search" className="text-on-surface-variant text-base" />
            <input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="설비명, Tag No.로 검색해서 추가"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          {addResults.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-surface-container-lowest border border-border-subtle rounded-xl shadow-lg max-h-56 overflow-y-auto">
              {addResults.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => addExtra(r)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-surface-container-low"
                  >
                    <span className="font-semibold text-on-surface">{r.name}</span>{" "}
                    <span className="text-xs text-on-surface-variant">
                      {r.tag_no ?? "—"} · {r.category ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {extras.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {extras.map((e) => (
              <li
                key={e.planId}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-success/10"
              >
                <Icon name="add_circle" className="text-status-success text-base" />
                <span className="flex-1 text-sm text-on-surface">{e.name}</span>
                <input
                  value={e.grade}
                  onChange={(ev) =>
                    setExtras((prev) =>
                      prev.map((x) => (x.planId === e.planId ? { ...x, grade: ev.target.value } : x)),
                    )
                  }
                  placeholder="등급"
                  className="w-14 h-8 px-2 rounded-lg bg-surface-container-lowest border border-border-subtle text-xs text-center outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeExtra(e.planId)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-highest text-on-surface-variant"
                >
                  <Icon name="close" className="text-sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 mt-5">
        <p className="text-xs text-on-surface-variant">
          {actionableCount}건 반영 예정 · {pendingCount}건 보류 (이번엔 반영 안 함)
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving || !candidates || actionableCount === 0}>
            {saving ? "반영 중…" : "이력에 반영"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
