"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Card, EmptyState, Icon } from "@/shared/components/ui";
import { BRANCHES } from "@/shared/lib/branches";
import {
  CLICKABLE_ROW,
  HEAD_ROW,
  TABLE,
  TD_Y,
  TH_Y,
  rowKeyHandler,
} from "@/shared/lib/tableStyle";
import { useToast } from "@/shared/components/Toast";
import { DEPARTMENTS, STATUS_OPTIONS, type IssueStatus } from "../lib/constants";
import type { StatusIssueRow } from "../lib/repo";
import { StatusBadge, formatDate, formatDateTime } from "./badges";

const SORTED_BRANCHES = [...BRANCHES].sort((a, b) => a.localeCompare(b, "ko"));

interface Filters {
  branch: string;
  status: string;
  department: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { branch: "", status: "", department: "", q: "" };

const SELECT_CLASS =
  "h-10 px-3 rounded-sm bg-surface-container-low border border-border-subtle text-sm text-on-surface outline-none focus:border-primary focus:bg-surface-container-lowest";

/**
 * 현황 조회 — 운영 근무자가 등록한 설비 이슈 목록, 그리고 유지보수 담당자의 조치 갱신.
 *
 * 목록은 아직 조치가 필요한 것(미완료 → 조치중 → 추후 조치 예정)부터, 같은 상태 안에서는
 * 최근 등록순으로 정렬돼 온다(서버 정렬). 조치 상태가 표의 첫 열이다. 행을 누르면 갱신 창이 열려 상태·조치 내용·예정일을
 * 바꾼다. 위쪽 상태 칩은 건수를 보여 주며 누르면 그 상태만 걸러 본다.
 * 처음에는 내 지사로 걸러 두고(유지보수 부서는 내 담당부서까지), '전체 지사'·'전체 부서'로 넓힐 수 있다. 운영부는 담당부서로 걸러지지 않는다.
 */
export default function StatusBoard({
  initialBranch,
  initialDepartment,
}: {
  /** 내 지사·부서(처음 접속 시 고른 값) — 처음에는 이 조건으로 걸러 보여 준다 */
  initialBranch: string;
  initialDepartment: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    branch: initialBranch,
    department: initialDepartment,
  });
  const [rows, setRows] = useState<StatusIssueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StatusIssueRow | null>(null);
  const reqSeq = useRef(0);

  const load = useCallback(async (f: Filters) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v.trim()) sp.set(k, v.trim());
      const json = await (await fetch(`/api/status/issues?${sp.toString()}`)).json();
      if (seq !== reqSeq.current) return; // 더 새 요청이 있으면 이 결과는 버린다
      if (!json.ok) throw new Error(json.error || "현황을 불러오지 못했습니다.");
      setRows(json.rows);
      setCounts(json.counts);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setError(e instanceof Error ? e.message : "현황을 불러오지 못했습니다.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  // 필터가 바뀌면 다시 조회한다. 검색어는 타이핑마다 요청하지 않도록 잠깐 기다린다
  useEffect(() => {
    const t = setTimeout(() => void load(filters), filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters, load]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasFilter = Boolean(filters.branch || filters.department || filters.q.trim());

  return (
    <>
      {/* 상태 칩 — 건수 + 누르면 그 상태만 */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="조치 상태별 보기">
        {[{ key: "", label: "전체", count: total }, ...STATUS_OPTIONS.map((s) => ({ key: s, label: s, count: counts[s] ?? 0 }))].map(
          (c) => {
            const on = filters.status === c.key;
            return (
              <button
                key={c.key || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter("status", c.key)}
                className={`px-3.5 py-2 rounded-full text-sm font-bold border transition-colors ${
                  on
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-surface-container-lowest text-on-surface-variant border-border-subtle hover:bg-surface-container-high"
                }`}
              >
                {c.label} <span className="tabular-nums">{c.count}</span>
              </button>
            );
          },
        )}
      </div>

      {/* 조건 */}
      <Card lift={false} className="p-4 grid gap-3 grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,1.6fr)]">
        <select
          aria-label="지사"
          value={filters.branch}
          onChange={(e) => setFilter("branch", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">전체 지사</option>
          {SORTED_BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          aria-label="담당부서"
          value={filters.department}
          onChange={(e) => setFilter("department", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">전체 부서</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="relative col-span-2 lg:col-span-1">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none"
          />
          <input
            aria-label="검색"
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="설비명·이슈 내용·작성자 검색"
            className={`${SELECT_CLASS} w-full pl-10`}
          />
        </div>
      </Card>

      <div className="flex items-center justify-between -mt-2">
        <p className="text-sm text-on-surface-variant" aria-live="polite">
          {loading ? "불러오는 중입니다…" : `${rows.length}건`}
        </p>
        {(hasFilter || filters.status) && (
          <button
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS })}
            className="text-sm font-bold text-primary hover:underline"
          >
            조건 모두 해제
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error text-sm">
          <Icon name="error" className="text-base" />
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 ? (
        <Card lift={false} className="p-0">
          <EmptyState
            icon="inventory_2"
            title={hasFilter || filters.status ? "조건에 맞는 현황이 없어요" : "등록된 현황이 아직 없어요"}
            desc={
              hasFilter || filters.status
                ? "조건을 바꾸거나 모두 해제해 보세요."
                : "운영 근무자가 현황 등록에서 이슈를 올리면 여기에 나타납니다."
            }
            action={
              !hasFilter && !filters.status ? (
                <Link
                  href="/status/new"
                  className="px-4 py-2.5 rounded-sm font-bold text-sm inline-flex items-center gap-2 bg-primary text-on-primary hover:opacity-90"
                >
                  <Icon name="edit_note" className="text-base" />
                  현황 등록하기
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card lift={false} className="p-0 overflow-hidden">
          {/* 폰 — 카드 목록 */}
          <ul className="md:hidden flex flex-col divide-y divide-border-subtle">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="w-full text-left p-4 flex flex-col gap-2 active:bg-surface-container-high"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-on-surface break-keep">{r.equipment_name}</p>
                  <p className="text-sm text-on-surface-variant line-clamp-2 break-keep">{r.content}</p>
                  <p className="text-xs text-on-surface-variant">
                    {[r.branch, r.department, r.reporter].filter(Boolean).join(" · ")}
                    {r.scheduled_date && ` · 예정 ${formatDate(r.scheduled_date)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* PC — 표 */}
          <div className="hidden md:block overflow-x-auto">
            <table className={`${TABLE} table-fixed`}>
              <colgroup>
                <col style={{ width: "130px" }} />
                <col style={{ width: "170px" }} />
                <col />
                <col style={{ width: "110px" }} />
                <col style={{ width: "96px" }} />
                <col style={{ width: "96px" }} />
                <col style={{ width: "110px" }} />
              </colgroup>
              <thead>
                <tr className={HEAD_ROW}>
                  {["조치 상태", "설비명", "이슈 내용", "지사", "담당부서", "작성자", "등록"].map((h) => (
                    <th key={h} className={`${TH_Y} px-3 text-center`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setSelected(r)}
                    onKeyDown={rowKeyHandler(() => setSelected(r))}
                    className={CLICKABLE_ROW}
                  >
                    <td className={`${TD_Y} px-3 align-top text-center`}>
                      <StatusBadge status={r.status} />
                      {r.scheduled_date && (
                        <span className="block text-xs text-on-surface-variant mt-1">
                          예정 {formatDate(r.scheduled_date)}
                        </span>
                      )}
                    </td>
                    <td className={`${TD_Y} px-3 align-top text-center`}>
                      <span className="line-clamp-2 break-keep font-bold">{r.equipment_name}</span>
                    </td>
                    <td className={`${TD_Y} px-3 align-top text-center`}>
                      <span className="line-clamp-2 break-keep">{r.content}</span>
                    </td>
                    <td className={`${TD_Y} px-3 align-top text-center`}>{r.branch ?? "-"}</td>
                    <td className={`${TD_Y} px-3 align-top text-center`}>{r.department}</td>
                    <td className={`${TD_Y} px-3 align-top text-center`}>{r.reporter}</td>
                    <td className={`${TD_Y} px-3 align-top text-center text-on-surface-variant`}>
                      {formatDateTime(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selected && (
        <UpdateDialog
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void load(filters);
          }}
        />
      )}
    </>
  );
}

/** 유지보수 담당자의 조치 갱신 창 — 상태·조치 내용·조치 예정일·조치자 */
export function UpdateDialog({
  row,
  onClose,
  onSaved,
}: {
  row: StatusIssueRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<IssueStatus>(row.status);
  const [note, setNote] = useState(row.action_note ?? "");
  const [date, setDate] = useState(row.scheduled_date ?? "");
  const [by, setBy] = useState(row.handled_by ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/status/issues/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, actionNote: note, scheduledDate: date, handledBy: by }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "저장하지 못했습니다.");
      toast("조치 현황을 저장했습니다");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // body 로 포털 — 첫 화면 카드(glass-card)처럼 backdrop-filter 가 걸린 조상 안에서 그리면 fixed 가
  // 그 카드 기준이 되어 창이 카드 안에 갇히고 뒤따르는 카드(설비관리 공정 현황)에 가려진다.
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statusDlgTitle"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface-container-lowest p-6 shadow-xl flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              <StatusBadge status={row.status} />
            </div>
            <h3 id="statusDlgTitle" className="text-title-sm text-on-surface break-keep">
              {row.equipment_name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="text-sm text-on-surface whitespace-pre-wrap break-keep">{row.content}</p>
        <p className="text-xs text-on-surface-variant">
          {[row.branch, row.department, `작성 ${row.reporter}`, formatDateTime(row.created_at)]
            .filter(Boolean)
            .join(" · ")}
          {row.status_updated_at && ` · 상태 변경 ${formatDateTime(row.status_updated_at)}`}
        </p>

        <div className="border-t border-border-subtle pt-4 flex flex-col gap-4">
          <h4 className="text-sm font-bold text-on-surface">조치 현황 갱신</h4>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="조치 상태">
            {STATUS_OPTIONS.map((s) => {
              const on = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatus(s)}
                  className={`h-11 rounded-sm border text-sm font-bold transition-colors ${
                    on
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-surface-container-low text-on-surface-variant border-border-subtle hover:bg-surface-container-high"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">조치 내용</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="어떤 조치를 했는지, 또는 앞으로 할 계획을 적어 주세요."
              className="input"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">
                조치 예정일{status === "추후 조치 예정" ? " (추후 조치 예정일 때 입력)" : ""}
              </span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">조치자</span>
              <input
                value={by}
                onChange={(e) => setBy(e.target.value)}
                placeholder="이름을 입력하세요."
                className="input"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error text-sm">
            <Icon name="error" className="text-base" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
