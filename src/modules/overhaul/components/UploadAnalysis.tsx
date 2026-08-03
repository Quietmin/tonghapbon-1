"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Icon, Button, FieldChip, EmptyState } from "@/shared/components/ui";
import ProjectSettings from "./ProjectSettings";
import type { ParsedTask } from "../lib/excelParser";

/**
 * 설계내역서 엑셀을 넣으면 즉시 분석해서 무엇이 추출됐는지 보여준다.
 *
 * 엑셀 원본은 서버에 저장하지 않는다. 파싱한 작업항목과 파일명만 남는다.
 */

const FIELD_OPTIONS = ["자동", "기계", "전기", "제어"] as const;

interface AnalysisResult {
  sourceId: string | null;
  fileName: string;
  sheetCount: number;
  totalRows: number;
  extractedCount: number;
  excludedCount: number;
  needVerifyCount: number;
  byField: Record<string, number>;
  byEquipment: Record<string, number>;
  sample: ParsedTask[];
}

interface Source {
  id: string;
  file_name: string;
  field_hint: string | null;
  task_count: number;
  uploaded_at: string;
}

export default function UploadAnalysis() {
  const [fieldHint, setFieldHint] = useState<string>("자동");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  // 분석에 쓴 파일을 들고 있어야 확정 저장 때 서버로 다시 보낼 수 있다
  const [pending, setPending] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/overhaul/sources");
    const json = await res.json();
    if (json.ok) setSources(json.sources);
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  /** 파일이 들어오면 바로 분석한다. 이 단계에서는 저장하지 않는다(dryRun). */
  const analyze = useCallback(
    async (files: File[]) => {
      const excel = files.filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f.name));
      if (!excel.length) {
        setError("엑셀 파일(.xlsx, .xlsm, .xls)만 분석할 수 있습니다.");
        return;
      }
      setError(null);
      setBusy(`${excel.map((f) => f.name).join(", ")} 분석 중…`);
      try {
        const fd = new FormData();
        for (const f of excel) fd.append("file", f);
        fd.append("fieldHint", fieldHint);
        fd.append("dryRun", "1");
        const res = await fetch("/api/overhaul/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "분석에 실패했습니다.");
        setResults((prev) => [...prev, ...json.results]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [fieldHint],
  );

  /** 미리 본 결과를 실제 작업항목으로 확정한다. 파일을 다시 보내 서버에서 재파싱한다. */
  const commit = useCallback(
    async (files: File[]) => {
      setBusy("작업항목으로 등록 중…");
      setError(null);
      try {
        const fd = new FormData();
        for (const f of files) fd.append("file", f);
        fd.append("fieldHint", fieldHint);
        const res = await fetch("/api/overhaul/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "등록에 실패했습니다.");
        setResults([]);
        setPending([]);
        await loadSources();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [fieldHint, loadSources],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      setPending((prev) => [...prev, ...files]);
      void analyze(files);
    },
    [analyze],
  );

  const removeSource = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`"${name}" 업로드를 되돌립니다. 이 파일에서 나온 작업항목도 함께 삭제됩니다.`))
        return;
      await fetch(`/api/overhaul/sources?id=${id}`, { method: "DELETE" });
      await loadSources();
    },
    [loadSources],
  );

  const totalExtracted = results.reduce((s, r) => s + r.extractedCount, 0);
  const totalVerify = results.reduce((s, r) => s + r.needVerifyCount, 0);

  return (
    <>
      <div>
        <h1 className="text-display-lg text-on-surface pt-2">업로드 분석</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          설계내역서 엑셀을 넣으면 바로 분석해서 작업항목을 뽑아냅니다. 엑셀 원본은 저장하지
          않고, 추출된 항목만 남습니다.
        </p>
      </div>

      <ProjectSettings />

      {/* 분야 지정 */}
      <Card className="p-card-padding" lift={false}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-label-caps uppercase text-on-surface-variant">분야 지정</span>
          <div className="flex gap-1.5">
            {FIELD_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFieldHint(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  fieldHint === f
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-on-surface-variant">
            {fieldHint === "자동"
              ? "작업명·규격·시트명으로 분야를 자동 판별합니다."
              : `추출된 모든 항목을 '${fieldHint}'로 지정합니다.`}
          </span>
        </div>
      </Card>

      {/* 드롭 존 */}
      <Card
        lift={false}
        className={`p-0 overflow-hidden transition-colors ${dragging ? "ring-2 ring-primary" : ""}`}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer py-14 px-6 flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-4">
            <Icon name={busy ? "hourglass_top" : "upload_file"} className="text-3xl" />
          </div>
          <p className="text-title-sm text-on-surface">
            {busy ?? "엑셀 파일을 여기에 끌어다 놓으세요"}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">
            클릭해서 고를 수도 있습니다 · .xlsx .xlsm .xls · 여러 개 한 번에 가능
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </Card>

      {error && (
        <Card className="p-4 border border-error/30" lift={false}>
          <p className="text-sm text-error flex items-center gap-2">
            <Icon name="error" className="text-base" />
            {error}
          </p>
        </Card>
      )}

      {/* 분석 결과 */}
      {results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-headline-md text-on-surface">
              분석 결과 <span className="text-primary">{totalExtracted}건</span>
              {totalVerify > 0 && (
                <span className="text-status-warning text-base font-bold ml-2">
                  확인 필요 {totalVerify}
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setResults([]);
                  setPending([]);
                }}
              >
                <Icon name="close" className="text-base" />
                취소
              </Button>
              <Button onClick={() => commit(pending)} disabled={!!busy}>
                <Icon name="playlist_add" className="text-base" />
                작업항목으로 등록
              </Button>
            </div>
          </div>

          {results.map((r, i) => (
            <Card key={`${r.fileName}-${i}`} className="p-card-padding" lift={false}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-title-sm text-on-surface">{r.fileName}</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    시트 {r.sheetCount}개 · 전체 {r.totalRows.toLocaleString()}행 중{" "}
                    <b className="text-primary">{r.extractedCount}건</b> 추출 ·{" "}
                    {r.excludedCount}건 제외(소계·합계·원가시트 등)
                  </p>
                </div>
                {r.needVerifyCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-status-warning/10 text-status-warning text-xs font-bold">
                    확인 필요 {r.needVerifyCount}건
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mt-4">
                <div>
                  <p className="text-label-caps uppercase text-on-surface-variant mb-1.5">분야별</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(r.byField).map(([f, n]) => (
                      <span key={f} className="flex items-center gap-1">
                        <FieldChip field={f} />
                        <span className="text-sm font-mono-data text-on-surface-variant">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-label-caps uppercase text-on-surface-variant mb-1.5">설비별</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(r.byEquipment).map(([e, n]) => (
                      <span
                        key={e}
                        className="px-2 py-0.5 rounded-full bg-surface-container-high text-xs font-bold text-on-surface-variant"
                      >
                        {e} {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {r.sample.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className="text-label-caps uppercase text-on-surface-variant mb-2">
                    미리보기 (상위 {r.sample.length}건)
                  </p>
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-on-surface-variant border-b border-border-subtle">
                        <th className="py-2 pr-3 font-semibold">작업명</th>
                        <th className="py-2 pr-3 font-semibold">규격</th>
                        <th className="py-2 pr-3 font-semibold text-right">수량</th>
                        <th className="py-2 pr-3 font-semibold">단위</th>
                        <th className="py-2 pr-3 font-semibold">분야</th>
                        <th className="py-2 pr-3 font-semibold">설비</th>
                        <th className="py-2 font-semibold">계획일정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.sample.map((t, j) => (
                        <tr key={j} className="border-b border-border-subtle/60">
                          <td className="py-2 pr-3 text-on-surface">{t.name}</td>
                          <td className="py-2 pr-3 text-on-surface-variant">{t.spec || "—"}</td>
                          <td className="py-2 pr-3 text-right font-mono-data">
                            {t.qty.toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-on-surface-variant">{t.unit}</td>
                          <td className="py-2 pr-3">
                            <FieldChip field={t.field} />
                          </td>
                          <td className="py-2 pr-3 text-on-surface-variant">{t.equipment}</td>
                          <td className="py-2 font-mono-data text-on-surface-variant">
                            {t.planStart ? `${t.planStart}${t.planEnd ? ` ~ ${t.planEnd}` : ""}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      {/* 등록된 업로드 이력 */}
      <div>
        <h2 className="text-headline-md text-on-surface mb-3">등록된 파일</h2>
        <Card className="p-0 overflow-hidden" lift={false}>
          {sources.length === 0 ? (
            <EmptyState
              icon="folder_open"
              title="등록된 파일이 없습니다"
              desc="위에 엑셀을 넣고 '작업항목으로 등록'을 누르면 여기에 쌓입니다."
            />
          ) : (
            <ul>
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-card-padding py-3 border-b border-border-subtle last:border-0"
                >
                  <Icon name="description" className="text-on-surface-variant" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{s.file_name}</p>
                    <p className="text-xs text-on-surface-variant">
                      작업항목 {s.task_count}건
                      {s.field_hint ? ` · 분야 ${s.field_hint} 지정` : ""} ·{" "}
                      {s.uploaded_at.slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <button
                    onClick={() => removeSource(s.id, s.file_name)}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                    title="이 파일의 작업항목 전체 삭제"
                  >
                    <Icon name="delete" className="text-lg" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
