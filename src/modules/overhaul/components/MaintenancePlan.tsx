"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Icon, Button, EmptyState, StatusChip } from "@/shared/components/ui";
import { exportDesignStatement } from "../lib/statementExporter";

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
  availableYears: number[];
  sources: PlanSource[];
  summary: Summary;
  rows: PlanRow[];
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
  const [field, setField] = useState("전기");
  const [tab, setTab] = useState<Tab>("필수");
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /** 사용자가 확정한 대상 (plan id) */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 항목별로 고친 단위 — 기본 EA */
  const [units, setUnits] = useState<Record<string, string>>({});

  const load = useCallback(async (year?: number) => {
    setLoading(true);
    const url = year ? `/api/overhaul/plan?year=${year}` : "/api/overhaul/plan";
    const json = await (await fetch(url)).json();
    if (json.ok) setData(json);
    else setError(json.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
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
      setBusy(`${excel[0].name} 분석 중…`);
      try {
        const fd = new FormData();
        for (const f of excel) fd.append("file", f);
        fd.append("field", field);
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
    [field, load, data?.targetYear],
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
  }, [rows, tab, q]);

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

  const exportExcel = useCallback(() => {
    if (!data || !chosen.length) return;
    const title = `${data.targetYear}년도 정기점검보수공사`;
    exportDesignStatement({
      title,
      items: chosen.map((r) => ({
        category: r.category,
        name: r.name,
        spec: r.spec,
        qty: 1,
        unit: units[r.id] ?? "EA",
        grade: r.plannedGrade,
        note: [
          r.tag_no && r.tag_no !== "-" ? r.tag_no : null,
          r.judge.classification === "선택" ? "선택 판단" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      fileName: `수량산출서_${data.targetYear}_${field}.xlsx`,
    });
  }, [data, chosen, units, field]);

  const saveStatement = useCallback(async () => {
    if (!data || !chosen.length) return;
    setBusy("수량산출서 저장 중…");
    setError(null);
    try {
      const json = await (
        await fetch("/api/overhaul/plan/statement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            targetYear: data.targetYear,
            field,
            title: `${data.targetYear}년도 정기점검보수공사`,
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
          <div className="flex items-center gap-2">
            <span className="text-label-caps uppercase text-on-surface-variant">분야</span>
            {["기계", "전기", "제어"].map((f) => (
              <button
                key={f}
                onClick={() => setField(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  field === f
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                }`}
              >
                {f}
              </button>
            ))}
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
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(Array.from(e.dataTransfer.files));
            }}
            className="cursor-pointer py-10 px-6 flex flex-col items-center text-center border-2 border-dashed border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Icon
              name={busy ? "hourglass_top" : "upload_file"}
              className="text-3xl text-on-surface-variant mb-2"
            />
            <p className="text-title-sm text-on-surface">
              {busy ?? "중장기 유지보수 관리계획 엑셀을 넣으세요"}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              한 번만 등록하면 됩니다. 매년 다시 넣을 필요 없습니다.
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
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
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={saveStatement} disabled={!selected.size || !!busy}>
                  <Icon name="save" className="text-base" />
                  이력 저장
                </Button>
                <Button onClick={exportExcel} disabled={!selected.size}>
                  <Icon name="table_view" className="text-base" />
                  수량산출서 엑셀
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
