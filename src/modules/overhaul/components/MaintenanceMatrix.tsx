"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Icon, Button, EmptyState } from "@/shared/components/ui";
import { exportMaintenanceMatrix } from "../lib/matrixExporter";

/**
 * 전체 설비 장기 보수 현황 — 30년 이상 추적용 매트릭스.
 *
 * MaintenancePlan(연도별 판정·수량산출서)과 짝을 이루는 화면이다. 저 화면은
 * "올해 무엇을 해야 하는가"를 보고, 이 화면은 "설비 하나가 몇 년 주기로
 * 언제 보수됐고 앞으로 언제 도래하는지"를 한 장으로 본다.
 *
 * 칸 하나는 세 가지 중 하나다.
 *   실적(record)  — 공정관리 실적에서 확인된 실제 보수. 가장 신뢰도가 높다
 *   계획(planned) — 관리계획 엑셀에 적혀 있던 등급. 실적으로 아직 확인되지 않았다
 *   추정(projected) — 엑셀 범위를 넘어선 미래를, 주기를 반복해 시스템이 계산한 값
 * 애매한 주기(조건부·필요시·이력없음)는 추정하지 않고 비워 둔다 — 사용자가 봐야 한다.
 */

interface MatrixCell {
  year: number;
  planned: string | null;
  done: string | null;
  hasRecord: boolean;
  skipped: boolean;
  projected: boolean;
  estimatedGrade: string | null;
}

interface MatrixRow {
  id: string;
  category: string | null;
  sub_category: string | null;
  name: string;
  tag_no: string | null;
  maker: string | null;
  spec: string | null;
  field: string | null;
  method: string | null;
  completion: string | null;
  cycle_raw: string | null;
  cycle_years: number | null;
  cycle_kind: string;
  isOverhaul: boolean;
  isActive: boolean;
  lastDoneYear: number | null;
  lastRecordYear: number | null;
  doneCount: number;
  judge: {
    classification: "필수" | "선택" | "불필요";
    reasonText: string;
    nextDueYear: number | null;
    overdueYears: number;
    needsDecision: boolean;
  };
  cells: MatrixCell[];
}

interface MatrixPayload {
  years: number[];
  thisYear: number;
  futureFrom: number;
  rows: MatrixRow[];
  summary: {
    total: number;
    dueNow: number;
    overdue: number;
    needsDecision: number;
    noHistory: number;
  };
}

const CLASS_DOT: Record<string, string> = {
  필수: "bg-error",
  선택: "bg-status-warning",
  불필요: "bg-outline-variant",
};

/** 설비 추가·수정 폼이 다루는 값 — 전부 문자열로 들고 있다가 저장 시 그대로 보낸다 */
interface PlanItemFormValues {
  category: string;
  subCategory: string;
  name: string;
  tagNo: string;
  maker: string;
  spec: string;
  field: string;
  cycleRaw: string;
  method: string;
  completion: string;
}

const BLANK_FORM: PlanItemFormValues = {
  category: "",
  subCategory: "",
  name: "",
  tagNo: "",
  maker: "",
  spec: "",
  field: "전기",
  cycleRaw: "",
  method: "",
  completion: "",
};

function rowToForm(r: MatrixRow): PlanItemFormValues {
  return {
    category: r.category ?? "",
    subCategory: r.sub_category ?? "",
    name: r.name,
    tagNo: r.tag_no ?? "",
    maker: r.maker ?? "",
    spec: r.spec ?? "",
    field: r.field ?? "",
    cycleRaw: r.cycle_raw ?? "",
    method: r.method ?? "",
    completion: r.completion ?? "",
  };
}

/** 설비 추가·수정 인라인 폼 — target이 null이 아니면 그 값으로 채워 "수정" 모드가 된다 */
function PlanItemForm({
  target,
  onCancel,
  onSaved,
}: {
  target: MatrixRow | "new";
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PlanItemFormValues>(
    target === "new" ? BLANK_FORM : rowToForm(target),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof PlanItemFormValues) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      setErr("기기명을 입력하세요.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        category: form.category.trim() || null,
        subCategory: form.subCategory.trim() || null,
        name: form.name.trim(),
        tagNo: form.tagNo.trim() || null,
        maker: form.maker.trim() || null,
        spec: form.spec.trim() || null,
        field: form.field.trim() || null,
        cycleRaw: form.cycleRaw.trim() || null,
        method: form.method.trim() || null,
        completion: form.completion.trim() || null,
      };
      const res = await fetch("/api/overhaul/plan/items", {
        method: target === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target === "new" ? body : { id: target.id, patch: body }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof PlanItemFormValues,
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={placeholder}
        className="h-10 px-3 rounded-lg bg-surface-container-low border border-border-subtle text-sm outline-none focus:border-primary"
      />
    </label>
  );

  return (
    <Card className="p-card-padding" lift={false}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-title-sm text-on-surface">
          {target === "new" ? "설비 추가" : "설비 정보 수정"}
        </h3>
        <button
          onClick={onCancel}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {field("대분류", "category", "예: 1. 발전설비")}
        {field("세부구분", "subCategory")}
        {field("기기명 *", "name")}
        {field("기기번호(Tag No.)", "tagNo")}
        {field("제작사", "maker")}
        {field("사양", "spec")}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-on-surface-variant">분야</span>
          <select
            value={form.field}
            onChange={(e) => set("field")(e.target.value)}
            className="h-10 px-3 rounded-lg bg-surface-container-low border border-border-subtle text-sm outline-none focus:border-primary"
          >
            <option value="">—</option>
            <option value="기계">기계</option>
            <option value="전기">전기</option>
            <option value="제어">제어</option>
          </select>
        </label>
        {field("정밀점검주기", "cycleRaw", "예: 2년, 필요시")}
        {field("시행방법", "method", "예: O/H, 경상정비")}
        {field("준공년도", "completion")}
      </div>
      {err && (
        <p className="text-sm text-error mt-3 flex items-center gap-1.5">
          <Icon name="error" className="text-base" /> {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </Card>
  );
}

/** 등급 하나를 칸에 그린다 — 실적/계획/추정을 다른 질감으로 구분한다 */
function GradeCell({ cell, isThisYear }: { cell: MatrixCell; isThisYear: boolean }) {
  const label = cell.done ?? cell.planned ?? (cell.projected ? "?" : "");

  if (cell.hasRecord && cell.skipped) {
    return (
      <div
        title={`${cell.year}년 · 계약변경 등으로 보수하지 않음 (확인된 사실)`}
        className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold text-on-surface-variant bg-surface-container-highest ${
          isThisYear ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        ✕
      </div>
    );
  }
  if (cell.hasRecord) {
    return (
      <div
        title={`${cell.year}년 · 실적으로 확인된 보수${cell.done ? ` (${cell.done}급)` : ""}`}
        className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold text-on-primary ${
          isThisYear ? "ring-2 ring-primary ring-offset-1" : ""
        } bg-status-success`}
      >
        {cell.done ?? "✓"}
      </div>
    );
  }
  if (cell.planned) {
    return (
      <div
        title={`${cell.year}년 · 관리계획 엑셀상 ${cell.planned}급 (실적 미확인)`}
        className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold text-on-surface bg-primary/15 border border-primary/30 ${
          isThisYear ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        {cell.planned}
      </div>
    );
  }
  if (cell.projected && cell.estimatedGrade) {
    return (
      <div
        title={`${cell.year}년 · 과거 등급이 반복되는 패턴을 찾아 추정한 등급 (확정 아님 — 확인 권장)`}
        className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold text-status-info border border-dashed border-status-info/50 ${
          isThisYear ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        {cell.estimatedGrade}
      </div>
    );
  }
  if (cell.projected) {
    return (
      <div
        title={`${cell.year}년 · 반복 패턴이 확인되지 않아 등급을 추정할 수 없음 — 확인 필요`}
        className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center text-[11px] font-bold text-on-surface-variant border border-dashed border-outline-variant ${
          isThisYear ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={`w-7 h-7 mx-auto rounded-md ${isThisYear ? "ring-1 ring-primary/40" : ""}`}
      aria-hidden={!label}
    />
  );
}

export default function MaintenanceMatrix() {
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string>("전체");
  const [q, setQ] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  /** null = 폼 닫힘 · "new" = 추가 모드 · 그 외 = 그 행을 수정하는 모드 */
  const [formTarget, setFormTarget] = useState<MatrixRow | "new" | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const reload = (alive: () => boolean = () => true) => {
    setLoading(true);
    const url = `/api/overhaul/plan/matrix${includeInactive ? "?includeInactive=1" : ""}`;
    return fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!alive()) return;
        if (json.ok) setData(json);
        else setError(json.error);
      })
      .catch((e) => alive() && setError(String(e)))
      .finally(() => alive() && setLoading(false));
  };

  useEffect(() => {
    let alive = true;
    void reload(() => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const toggleActive = async (r: MatrixRow) => {
    if (r.isActive && !confirm(`"${r.name}"을 사용중지 처리합니다. 과거 보수 이력은 그대로 남습니다.`)) {
      return;
    }
    setTogglingId(r.id);
    try {
      await fetch("/api/overhaul/plan/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id, isActive: !r.isActive }),
      });
      await reload();
    } finally {
      setTogglingId(null);
    }
  };

  const fields = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.field).filter((f): f is string => !!f))];
  }, [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    const kw = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (field !== "전체" && r.field !== field) return false;
      if (onlyAttention && !(r.judge.needsDecision || r.lastDoneYear == null)) return false;
      if (kw) {
        const hay = `${r.name} ${r.tag_no ?? ""} ${r.category ?? ""} ${r.spec ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [data, field, q, onlyAttention]);

  const exportExcel = () => {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    exportMaintenanceMatrix({
      years: data.years,
      rows: visible,
      fileName: `설비별_장기보수현황_${field}_${stamp}.xlsx`,
    });
  };

  if (loading) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }
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
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        icon="event_repeat"
        title="아직 등록된 관리계획이 없습니다"
        desc="'중장기 유지보수 관리계획' 탭에서 엑셀을 먼저 등록하세요."
      />
    );
  }

  return (
    <>
      {/* 요약 */}
      <Card className="p-card-padding" lift={false}>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              전체 설비
            </p>
            <p className="text-2xl font-black text-on-surface">{data.summary.total}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              올해 도래
            </p>
            <p className="text-2xl font-black text-error">{data.summary.dueNow}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              기한 초과
            </p>
            <p className="text-2xl font-black text-error">{data.summary.overdue}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              판단 필요
            </p>
            <p className="text-2xl font-black text-status-warning">{data.summary.needsDecision}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              이력 없음
            </p>
            <p className="text-2xl font-black text-on-surface-variant">{data.summary.noHistory}</p>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-4 flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-status-success inline-block" /> 실적으로 확인됨
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-surface-container-highest inline-block" /> 확인 후
            보수 안 함
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/30 inline-block" />{" "}
            계획(실적 미확인)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-dashed border-status-info/50 inline-block" />{" "}
            반복 패턴으로 추정
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-dashed border-outline-variant inline-block" />{" "}
            패턴 불명확 · 확인 필요
          </span>
        </p>
      </Card>

      {/* 필터 */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl w-full lg:w-fit">
          {["전체", ...fields].map((f) => (
            <button
              key={f}
              onClick={() => setField(f)}
              className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                field === f
                  ? "bg-surface-container-lowest text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-11 border border-transparent focus-within:border-primary transition-colors">
          <Icon name="search" className="text-on-surface-variant text-base" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="설비명, Tag No., 대분류 검색"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <label className="flex items-center gap-2 px-4 h-11 rounded-xl bg-surface-container-low cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyAttention}
            onChange={(e) => setOnlyAttention(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-semibold text-on-surface">확인 필요만</span>
        </label>
        <label className="flex items-center gap-2 px-4 h-11 rounded-xl bg-surface-container-low cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-semibold text-on-surface">사용중지 포함</span>
        </label>
        <Button variant="ghost" onClick={exportExcel} disabled={!visible.length}>
          <Icon name="table_view" className="text-base" />
          엑셀로 내보내기
        </Button>
        <Button onClick={() => setFormTarget("new")}>
          <Icon name="add" className="text-base" />
          설비 추가
        </Button>
      </div>

      {formTarget && (
        <PlanItemForm
          target={formTarget}
          onCancel={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            void reload();
          }}
        />
      )}

      {/* 매트릭스 */}
      <Card lift={false} className="p-0 overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState icon="search_off" title="해당하는 설비가 없습니다" />
        ) : (
          <div className="overflow-x-auto">
            <table className="text-left border-collapse">
              <thead>
                <tr className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="py-3 pl-card-padding pr-3 sticky left-0 bg-surface-container-lowest z-10 min-w-[220px]">
                    대분류 / 설비명
                  </th>
                  <th className="py-3 px-3 min-w-[90px]">주기</th>
                  <th className="py-3 px-3 min-w-[150px]">다음 예정 · 상태</th>
                  <th className="py-3 px-3 min-w-[80px]">관리</th>
                  {data.years.map((y) => (
                    <th
                      key={y}
                      className={`py-3 text-center w-11 font-mono-data ${
                        y === data.thisYear
                          ? "text-primary"
                          : y >= data.futureFrom
                            ? "text-on-surface-variant/70"
                            : ""
                      }`}
                    >
                      {String(y).slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-surface-container-low transition-colors ${
                      !r.isActive ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2 pl-card-padding pr-3 sticky left-0 bg-surface-container-lowest z-10">
                      <div className="flex items-center gap-1.5">
                        {r.field && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                            {r.field}
                          </span>
                        )}
                        {r.tag_no && r.tag_no !== "-" && (
                          <span className="font-mono-data text-[11px] text-on-surface-variant">
                            {r.tag_no}
                          </span>
                        )}
                        {!r.isActive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-error/10 text-error">
                            사용중지
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-on-surface text-sm truncate max-w-[200px]">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate max-w-[200px]">
                        {r.category ?? "—"}
                      </p>
                    </td>
                    <td className="py-2 px-3 text-sm whitespace-nowrap">
                      <span className="font-mono-data">{r.cycle_raw || "—"}</span>
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${CLASS_DOT[r.judge.classification]}`}
                        />
                        <span className="font-semibold text-on-surface">
                          {r.judge.nextDueYear ? `${r.judge.nextDueYear}년` : "—"}
                        </span>
                        {r.judge.needsDecision && (
                          <Icon
                            name="help"
                            className="text-[13px] text-status-warning"
                          />
                        )}
                      </div>
                      <p className="text-on-surface-variant truncate max-w-[140px]">
                        {r.lastDoneYear ? `직전 ${r.lastDoneYear}년` : "이력 없음"}
                      </p>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setFormTarget(r)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
                          title="수정"
                        >
                          <Icon name="edit" className="text-base" />
                        </button>
                        <button
                          onClick={() => toggleActive(r)}
                          disabled={togglingId === r.id}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40"
                          title={r.isActive ? "사용중지" : "다시 사용"}
                        >
                          <Icon name={r.isActive ? "visibility_off" : "visibility"} className="text-base" />
                        </button>
                      </div>
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.year} className="py-2 text-center">
                        <GradeCell cell={c} isThisYear={c.year === data.thisYear} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
