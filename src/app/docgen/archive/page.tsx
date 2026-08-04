"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Icon } from "@/shared/components/ui";
import { isDocgenSupabaseConfigured } from "@/modules/docgen/lib/supabase";
import { getSignedUrl, listArchive, type ArchiveRow } from "@/modules/docgen/lib/archive";
import { BRANCHES, MODE_LABELS, sortKorean, type DocMode } from "@/modules/docgen/lib/constants";

/**
 * 보관함 조회. 원본 legacy Photo-Report 의 search.html 에 대응.
 * 로그인 없이 누구나 조회할 수 있다 (supabase/docgen/01-docgen-schema.sql 필요).
 * 삭제·수정은 제공하지 않는다 — 무인증에서 열면 아무나 보관함을 비울 수 있다.
 */
const DOC_TYPES: { value: DocMode | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "report", label: MODE_LABELS.report },
  { value: "manual", label: MODE_LABELS.manual },
  { value: "fault", label: MODE_LABELS.fault },
];

function formatBytes(n: number | null): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocgenArchivePage() {
  const configured = isDocgenSupabaseConfigured();

  const [docType, setDocType] = useState<DocMode | "">("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [keyword, setKeyword] = useState("");

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listArchive({ docType, branch, year, keyword }));
    } catch (e) {
      // 대부분 anon 권한 미설정 — 무엇을 해야 하는지 알려준다
      const msg = e instanceof Error ? e.message : "보관함을 읽지 못했습니다.";
      setError(
        `${msg} — Supabase 에서 supabase/docgen/01-docgen-schema.sql 을 실행했는지 확인하세요.`,
      );
    } finally {
      setLoading(false);
    }
  }, [configured, docType, branch, year, keyword]);

  // 첫 진입 시 한 번 불러온다. 필터는 [검색] 버튼으로 다시 조회한다
  // (타이핑마다 요청하면 pg_trgm 부분검색이 계속 돌아 낭비다).
  useEffect(() => {
    if (configured) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  async function open(row: ArchiveRow) {
    try {
      const url = await getSignedUrl(row.pdf_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 를 열지 못했습니다.");
    }
  }

  return (
    <>
      <section className="pt-2">
        <h1 className="text-display-lg text-on-surface">보관함 조회</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          출력한 PDF가 자동 저장됩니다. 로그인 없이 누구나 지사·연도·종류별로 지난 문서를 찾아볼 수
          있습니다.
        </p>
      </section>

      {!configured ? (
        <Card className="p-card-padding">
          <div className="flex items-start gap-3">
            <Icon name="key_off" className="text-status-warning text-2xl" />
            <div>
              <p className="text-title-sm text-on-surface">보관함이 설정되지 않았습니다</p>
              <p className="text-sm text-on-surface-variant mt-1">
                <code className="font-mono-data">.env.local</code> 에{" "}
                <code className="font-mono-data">NEXT_PUBLIC_DOCGEN_SUPABASE_URL</code> 과{" "}
                <code className="font-mono-data">NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY</code> 를
                채우고, Supabase SQL Editor 에서{" "}
                <code className="font-mono-data">supabase/docgen/01-docgen-schema.sql</code> 을 한 번
                실행하세요.
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                설정하지 않아도 사진대장·매뉴얼·고장 보고서의{" "}
                <strong>PDF 생성과 다운로드는 그대로 됩니다.</strong>
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-card-padding">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fType" className="text-xs font-bold text-on-surface-variant">
                  종류
                </label>
                <select
                  id="fType"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocMode | "")}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fBranch" className="text-xs font-bold text-on-surface-variant">
                  지사
                </label>
                <select
                  id="fBranch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="">전체</option>
                  {sortKorean(BRANCHES).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fYear" className="text-xs font-bold text-on-surface-variant">
                  연도
                </label>
                <input
                  id="fYear"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="예: 2026"
                  className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fKeyword" className="text-xs font-bold text-on-surface-variant">
                  검색 (파일명·고장내용·설비명)
                </label>
                <input
                  id="fKeyword"
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void load();
                  }}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button onClick={() => void load()} disabled={loading}>
                <Icon name="search" className="text-lg" />
                {loading ? "찾고 있습니다…" : "검색"}
              </Button>
              <span className="text-sm text-on-surface-variant">{rows.length}건</span>
            </div>
            {error && (
              <p className="mt-3 text-sm font-bold text-status-error flex items-start gap-1.5">
                <Icon name="error" className="text-base shrink-0" />
                {error}
              </p>
            )}
          </Card>

          <Card className="p-card-padding">
            {rows.length === 0 && !loading ? (
              <EmptyState
                icon="inventory_2"
                title="문서가 없습니다"
                desc="사진대장·매뉴얼·고장 보고서를 만들고 [PDF 출력]을 누르면 여기에 쌓입니다."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-on-surface-variant border-b border-border-subtle">
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">종류</th>
                      <th className="py-2 pr-3 font-bold">파일명</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">지사</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">분야</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">작성자</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">사진</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">크기</th>
                      <th className="py-2 pr-3 font-bold whitespace-nowrap">만든 날짜</th>
                      <th className="py-2 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border-subtle last:border-0 text-on-surface"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {MODE_LABELS[r.doc_type] ?? r.doc_type}
                        </td>
                        <td className="py-2 pr-3">{r.file_name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.branch ?? "-"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.field ?? "-"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.author_name ?? "-"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.photo_count}장</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatBytes(r.pdf_bytes)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => void open(r)}
                            className="inline-flex items-center gap-1 text-primary font-bold hover:underline whitespace-nowrap"
                          >
                            <Icon name="open_in_new" className="text-base" />
                            열기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
