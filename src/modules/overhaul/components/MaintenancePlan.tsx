"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Icon, Button, EmptyState, StatusChip } from "@/shared/components/ui";
import { exportDesignStatement } from "../lib/statementExporter";
import MaintenanceMatrix from "./MaintenanceMatrix";
import StatementArchive from "./StatementArchive";

/**
 * 보수계획 수립 — 오버홀의 첫 단계.
 *
 *   ① 설비별 중장기 유지보수 관리계획 엑셀을 한 번 등록한다 (매년 다시 넣을 필요 없음)
 *   ② 연도를 고르면 시스템이 "점검주기 + 마지막 보수연도"로 대상을 판정한다
 *   ③ 사용자가 확정하면 수량산출서를 엑셀로 뽑는다 (일정은 빈칸)
 *
 * 그 내역서를 시공사가 일정을 채워 되돌려주면, 업로드 분석 화면에 넣어
 * 공정관리로 이어진다.
 *
 * 판정은 엑셀에 적힌 등급을 그대로 읽는 게 아니라 "마지막 보수연도 + 점검주기"로
 * 시스템이 계산한다. 그래서 오버홀 후 실적만 남기면 다음 회차가 자동으로 갱신된다.
 */

interface PlanSource {
  id: string;
  file_name: string;
  field: string | null;
  sheet_count: number;
  item_count: number;
  uploaded_at: string;
}

interface JudgeInfo {
  classification: "필수" | "선택" | "불필요";
  reason: string;
  reasonText: string;
  nextDueYear: number | null;
  overdueYears: number;
  needsDecision: boolean;
}

interface PlanRow {
  id: string;
  category: string | null;
  sub_category: string | null;
  name: string;
  tag_no: string | null;
  maker: string | null;
  spec: string | null;
  field: string | null;
  cycle_raw: string | null;
  cycle_years: number | null;
  cycle_kind: string;
  patrol_cycle: string | null;
  method: string | null;
  completion: string | null;
  last_done_year: number | null;
  recorded_year: number | null;
  judge: JudgeInfo;
  isOverhaul: boolean;
  plannedGrade: string | null;
}

interface Summary {
  total: number;
  byClassification: Record<string, number>;
  overhaulByClassification: Record<string, number>;
  nonOverhaulByMethod: Record<string, number>;
  needsDecisionCount: number;
}

interface Payload {
  targetYear: number;
  /** 서버가 실제로 걸러서 준 분야 (null이면 전체) */
  field: string | null;
  availableYears: number[];
  /** 등록된 계획에 실제로 들어있는 분야들 */
  availableFields: string[];
  sources: PlanSource[];
  summary: Summary;
  rows: PlanRow[];
}

/** 저장된 수량산출서 항목 — 엑셀로 뽑을 때 항목ID를 실어야 해서 저장 결과를 그대로 쓴다 */
interface SavedStatementItem {
  id: number;
  category: string | null;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  grade: string | null;
  note: string | null;
}

type Tab = "필수" | "선택" | "불필요" | "참고";

const CLASS_STYLE: Record<string, string> = {
  필수: "bg-status-error/10 text-status-error",
  선택: "bg-status-warning/10 text-status-warning",
  불필요: "bg-surface-container-highest text-on-surface-variant",
};

export default function MaintenancePlan() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 목록을 거르는 분야. "전체"면 안 거른다 */
  const [field, setField] = useState("전체");
  /**
   * 업로드할 계획 파일의 분야. 보기 필터와 일부러 분리했다 —
   * "전체"로 보다가 파일을 올리면 분야가 안 붙은 채 저장돼, 그 뒤로 분야 필터에
   * 영원히 안 걸리는 함정이 생긴다.
   */
  const [uploadField, setUploadField] = useState("전기");
  const [tab, setTab] = useState<Tab>("필수");
  const [q, setQ] = useState("");
  /** 연도별 판정(수량산출서용) ↔ 전체 설비 장기 현황(30년 추적용) ↔ 확정 내역서(이력 반영) */
  const [view, setView] = useState<"판정" | "현황" | "내역서">("판정");
  const inputRef = useRef<HTMLInputElement>(null);

  /** 사용자가 확정한 대상 (plan id) */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 항목별로 고친 단위 — 기본 EA */
  const [units, setUnits] = useState<Record<string, string>>({});
  /** 확정 저장 결과 안내 */
  const [confirmed, setConfirmed] = useState<{ count: number; year: number } | null>(null);

  const load = useCallback(
    async (year?: number, viewField?: string) => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (year) sp.set("year", String(year));
      sp.set("field", viewField ?? field);
      const json = await (await fetch(`/api/overhaul/plan?${sp}`)).json();
      if (json.ok) setData(json);
      else setError(json.error);
      setLoading(false);
    },
    [field],
  );

  useEffect(() => {
    void load();
    // load는 field가 바뀔 때마다 새로 만들어지므로, 분야를 바꾸면 목록이 다시 온다
  }, [load]);

  // 연도가 바뀌면 필수 항목을 기본 선택으로 채운다 (O/H만)
  useEffect(() => {
    if (!data) return;
    const next = new Set<string>();
    for (const r of data.rows) {
      if (r.isOverhaul && r.judge.classification === "필수") next.add(r.id);
    }
    setSelected(next);
    setUnits({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.targetYear, data?.rows]);

  const upload = useCallback(
    async (files: File[]) => {
      const excel = files.filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f.name));
      if (!excel.length) {
        setError("엑셀 파일(.xlsx, .xlsm, .xls)만 등록할 수 있습니다.");
        return;
      }
      setError(null);
      setBusy(`${excel.map((f) => f.name).join(", ")} 분석 중…`);
      try {
        const fd = new FormData();
        for (const f of excel) fd.append("file", f);
        fd.append("field", uploadField);
        const json = await (
          await fetch("/api/overhaul/plan/upload", { method: "POST", body: fd })
        ).json();
        if (!json.ok) throw new Error(json.error ?? "등록에 실패했습니다.");
        await load(data?.targetYear);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [uploadField, load, data?.targetYear],
  );

  const removeSource = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`"${name}" 계획을 지웁니다. 이 파일에서 나온 설비 목록도 함께 삭제됩니다.`)) return;
      await fetch(`/api/overhaul/plan?sourceId=${id}`, { method: "DELETE" });
      await load(data?.targetYear);
    },
    [load, data?.targetYear],
  );

  const rows = data?.rows ?? [];

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (field !== "전체" && r.field !== field) return false;
      // "참고" 탭 = O/H가 아닌 것들 (경상정비·용역 등). 내역서에는 안 들어간다
      if (tab === "참고") {
        if (r.isOverhaul) return false;
      } else {
        if (!r.isOverhaul) return false;
        if (r.judge.classification !== tab) return false;
      }
      if (kw) {
        const hay = `${r.name} ${r.tag_no ?? ""} ${r.category ?? ""} ${r.spec ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [rows, tab, q, field]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () => {
    const ids = visible.map((r) => r.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  /** 선택된 항목을 원본 순서대로 — 엑셀 출력·저장에 함께 쓴다 */
  const chosen = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  /**
   * 수량산출서 확정 — 저장하고, 저장된 항목으로 엑셀을 뽑는다.
   *
   * 저장과 엑셀 출력을 한 동작으로 묶은 이유: 엑셀 각 행에 실어 보내는 "항목ID"는
   * 저장하고 나서야 생긴다. 저장 없이 뽑은 파일은 그 표식이 없어서, 시공사가
   * 되돌려줬을 때 어느 항목인지 이어붙일 수 없다.
   */
  const confirmAndExport = useCallback(async () => {
    if (!data || !chosen.length) return;
    const statementField = field !== "전체" ? field : (chosen[0].field ?? null);
    const title = `${data.targetYear}년도 정기점검보수공사`;

    setBusy("수량산출서 확정 중…");
    setError(null);
    setConfirmed(null);
    try {
      const json = await (
        await fetch("/api/overhaul/plan/statement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            targetYear: data.targetYear,
            field: statementField,
            title,
            items: chosen.map((r) => ({
              planId: r.id,
              category: r.category,
              name: r.name,
              spec: r.spec,
              qty: 1,
              unit: units[r.id] ?? "EA",
              grade: r.plannedGrade,
              note: r.tag_no && r.tag_no !== "-" ? r.tag_no : null,
              classification: r.judge.classification,
            })),
          }),
        })
      ).json();
      if (!json.ok) throw new Error(json.error ?? "저장에 실패했습니다.");

      const saved: SavedStatementItem[] = json.items ?? [];
      exportDesignStatement({
        title,
        items: saved.map((it) => ({
          category: it.category,
          name: it.name,
          spec: it.spec,
          qty: it.qty,
          unit: it.unit,
          grade: it.grade,
          note: it.note,
          itemId: it.id,
        })),
        fileName: `수량산출서_${data.targetYear}_${statementField ?? "전체"}.xlsx`,
      });
      setConfirmed({ count: saved.length, year: data.targetYear });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [data, chosen, units, field]);

  if (loading && !data) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  const s = data?.summary;
  const hasPlan = (data?.sources.length ?? 0) > 0;

  return (
    <>
      <div>
        <h1 className="text-display-lg text-on-surface pt-2">보수계획 수립</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          설비별 중장기 유지보수 관리계획을 한 번 등록하면, 연도만 고르면 그 해에 보수할 대상을
          시스템이 점검주기로 판정합니다. 확정한 목록은 수량산출서 엑셀로 뽑아 시공사에 전달합니다.
        </p>
      </div>

      {/* 계획 등록 */}
      <Card className="p-card-padding" lift={false}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-title-sm text-on-surface flex items-center gap-2">
            <Icon name="event_repeat" className="text-base text-primary" />
            중장기 유지보수 관리계획
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label-caps uppercase text-on-surface-variant">분야 보기</span>
            {["전체", "기계", "전기", "제어"].map((f) => {
              const empty =
                f !== "전체" &&
                (data?.availableFields?.length ?? 0) > 0 &&
                !data!.availableFields.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => {
                    setField(f);
                    setSelected(new Set());
                  }}
                  title={empty ? "이 분야로 등록된 계획이 없습니다" : undefined}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                    field === f
                      ? "bg-primary text-on-primary"
                      : empty
                        ? "bg-surface-container-high text-on-surface-variant/40"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {hasPlan ? (
          <ul className="divide-y divide-border-subtle">
            {data!.sources.map((src) => (
              <li key={src.id} className="flex items-center gap-3 py-3">
                <Icon name="description" className="text-on-surface-variant" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{src.file_name}</p>
                  <p className="text-xs text-on-surface-variant">
                    설비 {src.item_count.toLocaleString()}건 · 시트 {src.sheet_count}개
                    {src.field ? ` · ${src.field}` : ""} ·{" "}
                    {src.uploaded_at.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
                <button
                  onClick={() => removeSource(src.id, src.file_name)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                  title="이 계획 삭제"
                >
                  <Icon name="delete" className="text-lg" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* 등록 영역 — 이미 올린 계획이 있어도 계속 열어 둔다.
            분야마다 파일이 따로 오므로(기계·전기·제어) 한 번 올리고 닫히면 안 된다. */}
        <div className={hasPlan ? "mt-4 pt-4 border-t border-border-subtle" : ""}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-label-caps uppercase text-on-surface-variant">
              등록할 파일의 분야
            </span>
            {["기계", "전기", "제어"].map((f) => (
              <button
                key={f}
                onClick={() => setUploadField(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  uploadField === f
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="text-xs text-on-surface-variant">
              올리는 파일의 설비가 전부 이 분야로 저장됩니다.
            </span>
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(Array.from(e.dataTransfer.files));
            }}
            className="cursor-pointer py-8 px-6 flex flex-col items-center text-center border-2 border-dashed border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Icon
              name={busy ? "hourglass_top" : "upload_file"}
              className="text-3xl text-on-surface-variant mb-2"
            />
            <p className="text-title-sm text-on-surface">
              {busy ??
                (hasPlan
                  ? `${uploadField} 관리계획 엑셀을 추가로 넣으세요`
                  : "중장기 유지보수 관리계획 엑셀을 넣으세요")}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              분야별로 한 번씩만 등록하면 됩니다. 매년 다시 넣을 필요 없습니다. · 여러 개 한
              번에 가능
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          multiple
          hidden
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </Card>

      {error && (
        <Card className="p-4 border border-error/30" lift={false}>
          <p className="text-sm text-error flex items-center gap-2">
            <Icon name="error" className="text-base" />
            {error}
          </p>
        </Card>
      )}

      {!hasPlan ? null : (
        <>
          {/* 판정(수량산출서용) ↔ 전체 현황(30년 추적용) ↔ 확정 내역서(이력 반영) */}
          <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl w-full lg:w-fit">
            {(
              [
                { key: "판정" as const, label: "연도별 판정", icon: "fact_check" },
                { key: "현황" as const, label: "전체 현황 (장기 추적)", icon: "timeline" },
                { key: "내역서" as const, label: "확정 내역서 · 이력 반영", icon: "checklist" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 justify-center ${
                  view === t.key
                    ? "bg-surface-container-lowest text-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <Icon name={t.icon} className="text-base" />
                {t.label}
              </button>
            ))}
          </div>

          {view === "현황" ? (
            <MaintenanceMatrix />
          ) : view === "내역서" ? (
            <StatementArchive />
          ) : (
          <>
          {/* 연도 선택 + 판정 요약 */}
          <Card className="p-card-padding" lift={false}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <label className="text-label-caps uppercase text-on-surface-variant block mb-1.5">
                  대상 연도
                </label>
                <select
                  value={data!.targetYear}
                  onChange={(e) => load(Number(e.target.value))}
                  className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-bold outline-none focus:border-primary"
                >
                  {data!.availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-4">
                {(["필수", "선택", "불필요"] as const).map((c) => (
                  <div key={c} className="text-center">
                    <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                      {c}
                    </p>
                    <p
                      className={`text-2xl font-black ${
                        c === "필수"
                          ? "text-error"
                          : c === "선택"
                            ? "text-status-warning"
                            : "text-on-surface-variant"
                      }`}
                    >
                      {s?.overhaulByClassification[c] ?? 0}
                    </p>
                  </div>
                ))}
                <div className="text-center">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                    선택됨
                  </p>
                  <p className="text-2xl font-black text-primary">{selected.size}</p>
                </div>
              </div>
            </div>

            {(s?.needsDecisionCount ?? 0) > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-status-warning/10 flex items-start gap-2">
                <Icon name="help" className="text-status-warning text-base mt-0.5" />
                <p className="text-sm text-on-surface">
                  <b>사용자 판단이 필요한 항목 {s!.needsDecisionCount}건</b>이 있습니다. 점검주기가
                  조건에 따라 다르거나("실내 3년 / 실외 2년"), 직전 보수 이력이 없어 시스템이 도래
                  여부를 계산할 수 없는 항목입니다. <b>선택</b> 탭에서 확인해 주세요.
                </p>
              </div>
            )}
          </Card>

          {/* 탭 + 검색 */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl w-full lg:w-fit">
              {(
                [
                  { key: "필수" as Tab, label: "필수", n: s?.overhaulByClassification["필수"] ?? 0 },
                  { key: "선택" as Tab, label: "선택", n: s?.overhaulByClassification["선택"] ?? 0 },
                  { key: "불필요" as Tab, label: "불필요", n: s?.overhaulByClassification["불필요"] ?? 0 },
                  {
                    key: "참고" as Tab,
                    label: "참고(O/H 외)",
                    n: Object.values(s?.nonOverhaulByMethod ?? {}).reduce((a, b) => a + b, 0),
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                    tab === t.key
                      ? "bg-surface-container-lowest text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t.label} {t.n}
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
          </div>

          {/* 목록 */}
          <Card lift={false} className="p-0 overflow-hidden">
            {tab === "참고" && (
              <div className="px-card-padding pt-4">
                <p className="text-sm text-on-surface-variant flex items-start gap-2">
                  <Icon name="info" className="text-base mt-0.5" />
                  경상정비·용역 등 <b>오버홀 공사 범위가 아닌 항목</b>입니다. 확인만 하시고,
                  수량산출서에는 들어가지 않습니다.
                </p>
              </div>
            )}
            {visible.length === 0 ? (
              <EmptyState
                icon="search_off"
                title="해당하는 설비가 없습니다"
                desc="다른 탭이나 검색어를 확인해 보세요."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[980px]">
                  <thead>
                    <tr className="text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                      <th className="py-3 pl-card-padding w-10">
                        {tab !== "참고" && (
                          <input
                            type="checkbox"
                            checked={visible.length > 0 && visible.every((r) => selected.has(r.id))}
                            onChange={toggleAllVisible}
                            className="w-4 h-4"
                            title="보이는 항목 전체 선택"
                          />
                        )}
                      </th>
                      <th className="py-3 pr-3">대분류 / 설비명</th>
                      <th className="py-3 px-3">규격</th>
                      <th className="py-3 px-3">주기</th>
                      <th className="py-3 px-3">판정 근거</th>
                      <th className="py-3 px-3 w-24">단위</th>
                      <th className="py-3 pr-card-padding">시행방법</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {visible.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-3 pl-card-padding">
                          {tab !== "참고" && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                              className="w-4 h-4"
                            />
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                CLASS_STYLE[r.judge.classification]
                              }`}
                            >
                              {r.judge.classification}
                            </span>
                            {r.judge.needsDecision && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-status-warning/15 text-status-warning flex items-center gap-1">
                                <Icon name="help" className="text-[12px]" />
                                판단 필요
                              </span>
                            )}
                            {r.plannedGrade && (
                              <span className="text-[11px] font-bold text-on-surface-variant">
                                계획 {r.plannedGrade}급
                              </span>
                            )}
                            {r.tag_no && r.tag_no !== "-" && (
                              <span className="font-mono-data text-xs text-on-surface-variant">
                                {r.tag_no}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-on-surface text-sm">{r.name}</p>
                          <p className="text-xs text-on-surface-variant">{r.category ?? "—"}</p>
                        </td>
                        <td className="py-3 px-3 text-sm text-on-surface-variant max-w-[200px]">
                          {r.spec || "—"}
                        </td>
                        <td className="py-3 px-3 text-sm whitespace-nowrap">
                          <span className="font-mono-data">{r.cycle_raw || "—"}</span>
                          {r.last_done_year && (
                            <p className="text-xs text-on-surface-variant">
                              직전 {r.recorded_year ?? r.last_done_year}년
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-on-surface-variant max-w-[280px]">
                          {r.judge.reasonText}
                        </td>
                        <td className="py-3 px-3">
                          {tab === "참고" ? (
                            <span className="text-sm text-on-surface-variant">—</span>
                          ) : (
                            <input
                              value={units[r.id] ?? "EA"}
                              onChange={(e) => setUnits({ ...units, [r.id]: e.target.value })}
                              className="w-16 h-8 px-2 rounded-lg bg-surface-container-low border border-border-subtle text-sm text-center outline-none focus:border-primary"
                            />
                          )}
                        </td>
                        <td className="py-3 pr-card-padding text-sm whitespace-nowrap">
                          {r.isOverhaul ? (
                            <StatusChip status="완료" />
                          ) : (
                            <span className="text-on-surface-variant">{r.method || "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 확정 · 출력 */}
          <Card className="p-card-padding" lift={false}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-title-sm text-on-surface">
                  선택한 <b className="text-primary">{selected.size}건</b>으로 수량산출서를 만듭니다
                </p>
                <p className="text-sm text-on-surface-variant mt-1">
                  명칭·규격·수량·단위·등급·비고가 채워지고 <b>작업 시작일·종료일은 빈칸</b>으로
                  나갑니다. 시공사가 그 칸을 채워 보내면 업로드 분석 화면에 넣어 공정관리를
                  시작하세요.
                </p>
                <p className="text-sm text-on-surface-variant mt-1.5">
                  맨 끝 <b>항목ID</b> 열은 지우지 말라고 안내하세요. 그 열이 남아 있어야
                  되돌아온 파일이 이 내역서와 정확히 이어지고, 준공 후 이력 반영이 자동으로
                  맞춰집니다.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={confirmAndExport} disabled={!selected.size || !!busy}>
                  <Icon name="table_view" className="text-base" />
                  {busy ? "만드는 중…" : "확정하고 엑셀 내보내기"}
                </Button>
              </div>
            </div>

            {confirmed && (
              <p className="text-sm text-status-success font-bold flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
                <Icon name="check_circle" className="text-base" />
                {confirmed.year}년도 수량산출서 {confirmed.count}건을 확정하고 엑셀로
                내보냈습니다.
                <button
                  onClick={() => setView("내역서")}
                  className="underline decoration-status-success/40"
                >
                  확정 내역서 보기
                </button>
              </p>
            )}
          </Card>
          </>
          )}
        </>
      )}
    </>
  );
}
