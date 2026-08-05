"use client";

import { useEffect, useState } from "react";
import { Card, Icon, Button, EmptyState } from "@/shared/components/ui";
import StatementReconcile from "./StatementReconcile";

/**
 * 확정해 둔 수량산출서(내역서) 목록 — 준공되면 여기서 "이력 반영"을 눌러
 * 실제 결과를 보수계획의 과거 이력으로 넘긴다.
 */

interface Statement {
  id: string;
  target_year: number;
  field: string | null;
  title: string | null;
  item_count: number;
  created_at: string;
  reconciled_at: string | null;
}

export default function StatementArchive() {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/overhaul/plan/statement")
      .then((r) => r.json())
      .then((json) => (json.ok ? setStatements(json.statements) : setError(json.error)))
      .catch((e) => setError(String(e)));
  };

  useEffect(load, []);

  const remove = async (id: string, title: string | null) => {
    if (!confirm(`"${title ?? "이 내역서"}"를 지웁니다. 반영된 이력은 지워지지 않습니다.`)) return;
    await fetch(`/api/overhaul/plan/statement?id=${id}`, { method: "DELETE" });
    load();
  };

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
  if (!statements) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }
  if (statements.length === 0) {
    return (
      <EmptyState
        icon="fact_check"
        title="아직 확정한 수량산출서가 없습니다"
        desc="'연도별 판정' 탭에서 대상을 골라 확정하면 여기 쌓입니다."
      />
    );
  }

  const openStatement = statements.find((s) => s.id === openId) ?? null;

  return (
    <>
      <Card className="p-card-padding" lift={false}>
        <p className="text-sm text-on-surface-variant">
          확정한 수량산출서가 시공사를 거쳐 <b>준공되면</b>, 여기서 "이력 반영"을 눌러 실제로 한
          것과 못 한 것을 확인하세요. 확인이 끝나면 보수계획의 과거 이력으로 넘어가 다음 회차
          판정에 그대로 반영됩니다.
        </p>
      </Card>

      {openStatement && (
        <StatementReconcile
          statement={openStatement}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null);
            load();
          }}
        />
      )}

      <Card lift={false} className="p-0 overflow-hidden">
        <ul className="divide-y divide-border-subtle">
          {statements.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-card-padding py-4">
              <Icon name="fact_check" className="text-on-surface-variant" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-surface truncate">
                  {s.title ?? `${s.target_year}년도 내역서`}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {s.target_year}년 · {s.item_count}건{s.field ? ` · ${s.field}` : ""} ·{" "}
                  {s.created_at.slice(0, 10)}
                </p>
              </div>
              {s.reconciled_at ? (
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-status-success/10 text-status-success whitespace-nowrap">
                  반영됨 · {s.reconciled_at.slice(0, 10)}
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-status-warning/10 text-status-warning whitespace-nowrap">
                  반영 필요
                </span>
              )}
              <Button variant="ghost" onClick={() => setOpenId(s.id)}>
                <Icon name="checklist" className="text-base" />
                이력 반영
              </Button>
              <button
                onClick={() => remove(s.id, s.title)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                title="이 내역서 삭제"
              >
                <Icon name="delete" className="text-lg" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
