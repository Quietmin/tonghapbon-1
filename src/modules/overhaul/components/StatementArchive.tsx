"use client";

import { useEffect, useState } from "react";
import { Card, Icon, Button, EmptyState } from "@/shared/components/ui";
import { exportDesignStatement } from "../lib/statementExporter";
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

/** 저장된 항목 — 엑셀로 다시 뽑을 때 항목ID를 그대로 실어야 한다 */
interface SavedItem {
  id: number;
  category: string | null;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  grade: string | null;
  note: string | null;
  plan_start: string | null;
  plan_end: string | null;
}

export default function StatementArchive() {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/overhaul/plan/statement")
      .then((r) => r.json())
      .then((json) => (json.ok ? setStatements(json.statements) : setError(json.error)))
      .catch((e) => setError(String(e)));
  };

  useEffect(load, []);

  /**
   * 확정해 둔 내역서를 엑셀로 다시 뽑는다.
   *
   * 항목ID를 그대로 실어 내보내므로, 시공사에 다시 보내도 되돌아왔을 때 이어붙는다.
   * (파일을 잃어버렸거나 시공사가 항목ID 열을 지워 보냈을 때 다시 주면 된다)
   */
  const exportOne = async (s: Statement) => {
    setBusyId(s.id);
    setError(null);
    try {
      const json = await (await fetch(`/api/overhaul/plan/statement?id=${s.id}`)).json();
      if (!json.ok) throw new Error(json.error ?? "불러오지 못했습니다.");
      const items: SavedItem[] = json.items ?? [];
      const title = s.title ?? `${s.target_year}년도 정기점검보수공사`;
      exportDesignStatement({
        title,
        items: items.map((it) => ({
          category: it.category,
          name: it.name,
          spec: it.spec,
          qty: it.qty,
          unit: it.unit,
          grade: it.grade,
          note: it.note,
          itemId: it.id,
        })),
        fileName: `수량산출서_${s.target_year}_${s.field ?? "전체"}.xlsx`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, title: string | null) => {
    if (!confirm(`"${title ?? "이 내역서"}"를 지웁니다. 반영된 이력은 지워지지 않습니다.`)) return;
    await fetch(`/api/overhaul/plan/statement?id=${id}`, { method: "DELETE" });
    load();
  };

  // 목록을 못 읽었을 때만 화면을 대체한다. 엑셀 출력 같은 부분 실패는
  // 목록을 지우지 않고 아래에 띠로 띄운다.
  if (error && !statements) {
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

      {error && (
        <Card className="p-4 border border-error/30" lift={false}>
          <p className="text-sm text-error flex items-center gap-2">
            <Icon name="error" className="text-base" />
            {error}
          </p>
        </Card>
      )}

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
              <Button
                variant="ghost"
                onClick={() => exportOne(s)}
                disabled={busyId === s.id}
                title="항목ID를 실은 수량산출서 엑셀을 다시 내려받습니다"
              >
                <Icon name="table_view" className="text-base" />
                {busyId === s.id ? "뽑는 중…" : "엑셀"}
              </Button>
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
