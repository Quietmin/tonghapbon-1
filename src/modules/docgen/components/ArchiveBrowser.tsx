"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ACCENT_STYLE,
  Button,
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  type Accent,
} from "@/shared/components/ui";
import { isDocgenSupabaseConfigured } from "../lib/supabase";
import {
  deleteFromArchive,
  getSignedUrl,
  listArchive,
  type ArchiveRow,
  type ListFilter,
} from "../lib/archive";
import {
  BRANCHES,
  FAULT_FIELDS,
  MANUAL_FIELDS,
  MANUAL_TYPES,
  MODE_LABELS,
  sortKorean,
  type DocMode,
} from "../lib/constants";

/**
 * 보관함 조회 — 원본 legacy Photo-Report 의 search.html 에 대응.
 *
 * 원래 /docgen/archive 한 화면에만 있던 것을 컴포넌트로 뽑았다. 고장관리·매뉴얼관리
 * 챕터가 각자 "자기 종류만" 보는 조회 화면을 갖되, 검색 조건과 표 서식은 한 벌만
 * 두기 위해서다. 복사해 두면 나중에 컬럼 하나 고칠 때 두 곳이 갈라진다.
 *
 * 로그인 없이 누구나 조회할 수 있다 (supabase/docgen/01-docgen-schema.sql 필요).
 * 수정은 제공하지 않는다. 삭제는 전체 조회 화면에서만 — 챕터 첫 화면의 "최근 문서"
 * 요약에는 두지 않는다. 지나가다 누르는 자리가 아니고, 확인창만으로는 되돌릴 수
 * 없는 작업을 받치기에 모자라기 때문이다. 삭제는 암호(DELETE_PASSWORD)를 한 번 더
 * 묻는다 — 보안이 아니라 실수 방지다(그 상수 주석 참고).
 */
const DOC_TYPES: { value: DocMode | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "report", label: MODE_LABELS.report },
  { value: "manual", label: MODE_LABELS.manual },
  { value: "fault", label: MODE_LABELS.fault },
];

/**
 * 삭제 암호.
 *
 * ⚠️ 이것은 보안 장치가 아니라 실수 방지 장치다. 브라우저로 내려가는 코드에 들어
 * 있으므로 개발자도구나 소스 보기로 누구나 읽을 수 있고, 화면을 거치지 않고
 * anon 키로 직접 요청하면 그냥 지나간다. 실제 권한은 서버의 RLS 정책이 쥔다
 * (supabase/docgen/02-docgen-delete.sql). 진짜로 막아야 한다면 로그인을 붙이고
 * 그 정책을 관리자에게만 열어야 한다.
 */
const DELETE_PASSWORD = "2488";

/** 표의 '종류' 배지 색 — 챕터 색과 같다 (사진대장은 챕터가 없어 회색) */
const DOC_TYPE_BADGE: Record<DocMode, string> = {
  manual: ACCENT_STYLE.primary.chip,
  fault: ACCENT_STYLE.tertiary.chip,
  report: "bg-surface-container-highest text-on-surface-variant",
};

/** [수정] 이 가는 작성 화면 — 종류마다 주소가 다르다 */
const EDIT_PATH: Record<DocMode, string> = {
  manual: "/manual/new",
  fault: "/failure/new",
  report: "/docgen/photo-report",
};

function formatBytes(n: number | null): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** [초기화] 가 넘기는 값 — 모든 조건을 비운 상태 */
const EMPTY_FILTERS: Partial<ListFilter> = {
  branch: "",
  field: "",
  manualType: "",
  facility: "",
  faultContent: "",
  authorName: "",
  fileName: "",
};

const FIELD_CLASS =
  "px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary";

/** 조회 조건 셀렉트 — 첫 항목은 늘 '전체'(= 조건 없음)다 */
function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 손으로 적는 조건 — Enter 로도 조회된다(버튼까지 내려가지 않아도 되게) */
function FilterInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        placeholder={placeholder}
        className={FIELD_CLASS}
      />
    </div>
  );
}

export interface ArchiveBrowserProps {
  /**
   * 이 종류만 조회한다. 주면 종류 셀렉트를 감춘다 — 고를 값이 하나뿐이라
   * 남겨 두면 "전체"로 되돌려 다른 종류가 섞여 나올 수 있다.
   * 표의 종류 컬럼은 원본 서식을 그대로 두기 위해 남긴다.
   */
  fixedType?: DocMode;
  /** 화면 상단 제목·설명. 챕터 랜딩에 끼울 때는 넘기지 않는다 */
  heading?: { title: string; desc: string };
  /**
   * 챕터 색 (고장관리는 tertiary). 넘기지 않으면 보고 있는 종류에서 고른다 —
   * 보관함 전체 조회처럼 종류가 섞인 화면은 파랑이다.
   */
  accent?: Accent;
  /**
   * 제목 줄 오른쪽에 서는 것 — 챕터 첫 화면에서 "작성"으로 가는 버튼.
   * 좁은 폭에서는 제목 아래로 내려가 가로폭을 다 쓴다(모바일 하단탭에는 '작성'이
   * 없어서, 이 버튼이 작성으로 가는 유일한 길이다).
   */
  headingAction?: React.ReactNode;
  /**
   * 챕터 랜딩용 요약 모드 — 필터 UI 없이 최근 N건만 같은 표로 보여준다.
   * 표 서식은 전체 조회 화면과 완전히 같다.
   */
  preview?: number;
  /** 요약 모드에서 "전체 보기"로 갈 경로 */
  moreHref?: string;
  /**
   * 행마다 [삭제] 를 둘지. 기본은 전체 조회에서만 켠다(요약 모드에서는 끈다).
   * 실제 권한은 서버 RLS 가 쥐고 있다 — 이 값은 버튼을 그릴지만 정한다.
   */
  allowDelete?: boolean;
}

export default function ArchiveBrowser({
  fixedType,
  heading,
  headingAction,
  accent,
  preview,
  moreHref,
  allowDelete,
}: ArchiveBrowserProps) {
  const configured = isDocgenSupabaseConfigured();
  const isPreview = typeof preview === "number";
  const canDelete = allowDelete ?? !isPreview;
  /* 고장 보고서만 주황이다 — 종류가 섞인 전체 조회는 파랑으로 둔다 */
  const tone: Accent = accent ?? (fixedType === "fault" ? "tertiary" : "primary");

  /*
   * 조회 조건. 원본 search.html 의 입력칸 묶음을 그대로 옮겼다 —
   * 지사·분야는 공통, 매뉴얼 종류는 매뉴얼 전용, 설비명·고장내용은 고장 보고서
   * 전용이고, 작성자·파일명은 둘 다 쓴다.
   */
  const [docType, setDocType] = useState<DocMode | "">(fixedType ?? "");
  const [branch, setBranch] = useState("");
  const [field, setField] = useState("");
  const [manualType, setManualType] = useState("");
  const [facility, setFacility] = useState("");
  const [faultContent, setFaultContent] = useState("");
  const [author, setAuthor] = useState("");
  const [fileName, setFileName] = useState("");

  /*
   * 조건은 접어 둔 채로 들어온다 — 화면을 열면 결과가 먼저 보이고, 조건을 만질
   * 때만 펴면 되므로 목록에 쓸 자리가 넓어진다. (원본과 같은 기본값)
   */
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** 지금 종류에서 실제로 쓰이는 칸만 본다 — 숨어 있는 칸은 세지 않는다 */
  const type = fixedType ?? docType;
  const showManualType = type === "manual" || type === "";
  const showFaultFields = type === "fault" || type === "";
  const activeCount = [
    branch,
    field,
    showManualType ? manualType : "",
    showFaultFields ? facility : "",
    showFaultFields ? faultContent : "",
    author,
    fileName,
  ].filter((v) => v.trim() !== "").length;

  /** 분야 목록은 종류마다 다르다. '전체'일 때는 둘을 합쳐 보여 준다. */
  const fieldOptions =
    type === "fault"
      ? FAULT_FIELDS
      : type === "manual"
        ? MANUAL_FIELDS
        : Array.from(new Set([...MANUAL_FIELDS, ...FAULT_FIELDS]));

  function resetFilters() {
    setBranch("");
    setField("");
    setManualType("");
    setFacility("");
    setFaultContent("");
    setAuthor("");
    setFileName("");
  }

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * overrides 를 받는 이유: [초기화]는 칸을 비운 그 자리에서 바로 다시 조회해야
   * 하는데, setState 는 즉시 반영되지 않아 여기서 state 를 읽으면 비우기 전 값이
   * 잡힌다. 비운 값을 직접 넘겨 그 틈을 없앤다.
   */
  const load = useCallback(async (overrides?: Partial<ListFilter>) => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      // fixedType 이 있으면 종류가 절대 흔들리지 않게 여기서 다시 고정한다
      setRows(
        await listArchive({
          docType: fixedType ?? docType,
          branch,
          field,
          // 그 종류에 없는 칸은 보내지 않는다 — 숨어 있는 칸의 옛 값이 조용히
          // 조건으로 걸리면, 화면에는 아무 조건도 안 보이는데 결과만 비어 버린다
          manualType: showManualType ? manualType : "",
          facility: showFaultFields ? facility : "",
          faultContent: showFaultFields ? faultContent : "",
          authorName: author,
          fileName,
          limit: preview,
          ...overrides,
        }),
      );
    } catch (e) {
      // 대부분 anon 권한 미설정 — 무엇을 해야 하는지 알려준다
      const msg = e instanceof Error ? e.message : "보관함을 읽지 못했습니다.";
      setError(
        `${msg} — Supabase 에서 supabase/docgen/01-docgen-schema.sql 을 실행했는지 확인하세요.`,
      );
    } finally {
      setLoading(false);
    }
  }, [
    configured,
    fixedType,
    docType,
    branch,
    field,
    manualType,
    facility,
    faultContent,
    author,
    fileName,
    showManualType,
    showFaultFields,
    preview,
  ]);

  // 첫 진입 시 한 번 불러온다. 필터는 [검색] 버튼으로 다시 조회한다
  // (타이핑마다 요청하면 pg_trgm 부분검색이 계속 돌아 낭비다).
  useEffect(() => {
    if (configured) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  /** 지우는 중인 행 — 같은 행을 두 번 누르는 것을 막고 버튼에 표시한다 */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 암호 확인창에 올라와 있는 행 — null 이면 창이 닫혀 있다 */
  const [pendingRow, setPendingRow] = useState<ArchiveRow | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  function askPassword(row: ArchiveRow) {
    setPendingRow(row);
    setPassword("");
    setPwError(null);
  }

  function closeAsk() {
    setPendingRow(null);
    setPassword("");
    setPwError(null);
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingRow) return;
    if (password !== DELETE_PASSWORD) {
      setPwError("암호가 맞지 않습니다.");
      setPassword("");
      return;
    }
    const row = pendingRow;
    closeAsk();
    void remove(row);
  }

  async function remove(row: ArchiveRow) {
    setDeletingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const { fileRemoved } = await deleteFromArchive(row);
      // 다시 조회하지 않고 목록에서만 뺀다 — 방금 지운 행이라 결과가 뻔하다
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (fileRemoved) {
        setNotice(`"${row.file_name}" 을(를) 삭제했습니다.`);
      } else {
        // 행은 지워졌지만 PDF 가 남았다 — 조용히 넘기면 버킷에 고아 파일이 쌓인다
        setError(
          `"${row.file_name}" 문서는 삭제했지만 저장된 PDF 파일은 지우지 못했습니다. ` +
            "Storage 삭제 권한(supabase/docgen/02-docgen-delete.sql)을 확인하세요.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function open(row: ArchiveRow) {
    try {
      const url = await getSignedUrl(row.pdf_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 를 열지 못했습니다.");
    }
  }

  if (!configured) {
    return (
      <Card className="p-card-padding">
        <div className="flex items-start gap-3">
          <Icon name="key_off" className="text-status-warning text-2xl" />
          <div>
            <p className="text-title-sm text-on-surface">보관함이 설정되지 않았습니다</p>
            <p className="text-sm text-on-surface-variant mt-1">
              <code className="font-mono-data">.env.local</code> 에{" "}
              <code className="font-mono-data">NEXT_PUBLIC_DOCGEN_SUPABASE_URL</code> 과{" "}
              <code className="font-mono-data">NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY</code> 를 채우고,
              Supabase SQL Editor 에서{" "}
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
    );
  }

  return (
    <>
      {heading && (
        <ScreenHeader
          icon="inventory_2"
          title={heading.title}
          desc={heading.desc}
          accent={tone}
          // 연한 칩 = 조회. 작성 화면은 같은 색 꽉 찬 칩이라 둘이 바로 갈린다
          tone="soft"
          action={headingAction}
        />
      )}

      {!isPreview && (
        <Card className="p-0 overflow-hidden" lift={false}>
          {/* 머리줄 — 누르면 펴고 접는다. 접혀 있을 때도 몇 개가 걸렸는지는 보인다 */}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="archiveFilters"
            className="w-full flex items-center gap-2 px-card-padding py-4 text-left hover:bg-surface-container-high transition-colors"
          >
            <span className="text-title-sm text-on-surface">조회 검색</span>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary text-xs font-bold">
                {activeCount}개 적용
              </span>
            )}
            <Icon
              name="expand_more"
              className={`ml-auto text-xl text-on-surface transition-transform duration-200 ${
                filtersOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/*
            0fr → 1fr 로 펼친다. 내용 높이를 미리 몰라도 부드럽게 열리고, 닫힌
            동안에는 높이가 0 이라 탭 이동도 안쪽으로 들어가지 않는다. (원본과 같은 수법)
          */}
          <div
            id="archiveFilters"
            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
              filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden min-h-0">
              <div className="px-card-padding pb-card-padding flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* 종류 — 챕터 조회 화면은 종류가 고정이라 칸 자체를 두지 않는다 */}
                  {!fixedType && (
                    <FilterSelect
                      id="fType"
                      label="종류"
                      value={docType}
                      onChange={(v) => setDocType(v as DocMode | "")}
                      options={DOC_TYPES.filter((t) => t.value !== "").map((t) => ({
                        value: t.value,
                        label: t.label,
                      }))}
                    />
                  )}
                  <FilterSelect
                    id="fBranch"
                    label="지사"
                    value={branch}
                    onChange={setBranch}
                    options={sortKorean(BRANCHES).map((b) => ({ value: b, label: b }))}
                  />
                  <FilterSelect
                    id="fField"
                    label="분야"
                    value={field}
                    onChange={setField}
                    options={sortKorean(fieldOptions).map((f) => ({ value: f, label: f }))}
                  />
                  {showManualType && (
                    <FilterSelect
                      id="fManualType"
                      label="매뉴얼 종류"
                      value={manualType}
                      onChange={setManualType}
                      options={sortKorean(MANUAL_TYPES).map((m) => ({ value: m, label: m }))}
                    />
                  )}
                  {showFaultFields && (
                    <>
                      <FilterInput
                        id="fFacility"
                        label="설비명"
                        value={facility}
                        onChange={setFacility}
                        placeholder="예: 변압기"
                        onEnter={load}
                      />
                      <FilterInput
                        id="fContent"
                        label="고장내용"
                        value={faultContent}
                        onChange={setFaultContent}
                        placeholder="예: 방압변"
                        onEnter={load}
                      />
                    </>
                  )}
                  <FilterInput
                    id="fAuthor"
                    label="작성자"
                    value={author}
                    onChange={setAuthor}
                    placeholder="작성자 이름 일부 입력"
                    onEnter={load}
                  />
                  {/*
                    파일명은 길어서 보통 한 줄을 통째로 쓴다(원본도 grid-column:1/-1).
                    고장 보고서만 예외다 — 앞의 칸이 홀수(지사·분야·설비명·고장내용·
                    작성자)라 파일명이 내려가면 작성자 옆이 비어 버린다. 그래서 거기서는
                    작성자와 한 줄에 나란히 세운다. (원본도 type-fault 에서는 안 늘린다)
                  */}
                  <div className={type === "fault" ? "" : "md:col-span-2"}>
                    <FilterInput
                      id="fFileName"
                      label="파일명"
                      value={fileName}
                      onChange={setFileName}
                      placeholder="파일명 일부 입력"
                      onEnter={load}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      resetFilters();
                      // 조건을 비운 즉시 전체를 다시 보여 준다 — 비우고 나서
                      // [조회]를 또 눌러야 하면 비운 티가 나지 않는다 (원본과 같다).
                      // 비운 값을 직접 넘긴다 (load 의 overrides 주석 참고)
                      void load(EMPTY_FILTERS);
                    }}
                    disabled={loading}
                  >
                    초기화
                  </Button>
                  <Button onClick={() => void load()} disabled={loading}>
                    <Icon name="search" className="text-lg" />
                    {loading ? "조회 중…" : "조회"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 결과 줄 — 접힌 상태에서도 몇 건인지는 늘 보여야 한다 */}
      {!isPreview && (
        <div className="-mt-2">
          <p className="text-sm text-on-surface-variant">
            {loading
              ? "조회 중입니다…"
              : rows.length === 0
                ? "조건에 맞는 문서가 없습니다."
                : `${rows.length}건을 찾았습니다.`}
          </p>
          {error && (
            <p className="mt-2 text-sm font-bold text-status-error flex items-start gap-1.5">
              <Icon name="error" className="text-base shrink-0" />
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-2 text-sm font-bold text-status-success flex items-start gap-1.5">
              <Icon name="check_circle" className="text-base shrink-0" />
              {notice}
            </p>
          )}
        </div>
      )}

      <Card className="p-card-padding">
        {isPreview && (
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-title-sm text-on-surface">최근 문서</h2>
            {moreHref && (
              <Link
                href={moreHref}
                className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline whitespace-nowrap"
              >
                전체 보기
                <Icon name="arrow_forward" className="text-base" />
              </Link>
            )}
          </div>
        )}
        {isPreview && error && (
          <p className="mb-3 text-sm font-bold text-status-error flex items-start gap-1.5">
            <Icon name="error" className="text-base shrink-0" />
            {error}
          </p>
        )}
        {rows.length === 0 && !loading ? (
          <EmptyState
            icon="inventory_2"
            title="문서가 없습니다"
            desc="사진대장·매뉴얼·고장 보고서를 만들고 [PDF 출력]을 누르면 여기에 쌓입니다."
          />
        ) : (
          <>
            {/*
              폰 폭(md 미만) 전용 카드 목록. 데스크톱 표를 그대로 욱여넣으면
              9칸짜리 표가 손바닥만 한 칸 안에서 또 옆으로 스크롤해야 하고(그
              안에서 또 스크롤 — 이중 스크롤), 파일명은 한 글자씩 세로로 줄바꿈돼
              버린다. PC 표는 그대로 두고(hidden md:block), 폰에서는 같은 행
              데이터를 카드 한 장으로 다시 짠다 — 버튼도 손가락으로 누르기 좋게
              커진다.
            */}
            <ul className="md:hidden flex flex-col gap-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-border-subtle p-4 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-block shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${
                        DOC_TYPE_BADGE[r.doc_type] ?? "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {MODE_LABELS[r.doc_type] ?? r.doc_type}
                    </span>
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-on-surface break-keep">{r.file_name}</p>

                  <p className="text-xs text-on-surface-variant">
                    {[r.branch, r.field, r.author_name].filter(Boolean).join(" · ") || "-"}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    사진 {r.photo_count}장 · {formatBytes(r.pdf_bytes)}
                  </p>

                  <div className="flex items-center gap-1 pt-2 mt-1 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={() => void open(r)}
                      className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-primary active:bg-surface-container-high"
                    >
                      <Icon name="open_in_new" className="text-lg" />
                      <span className="text-xs font-bold">열기</span>
                    </button>
                    {r.source_id && (
                      <Link
                        href={`${EDIT_PATH[r.doc_type]}?edit=${r.source_id}`}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-on-surface-variant active:bg-surface-container-high"
                      >
                        <Icon name="edit" className="text-lg" />
                        <span className="text-xs font-bold">수정</span>
                      </Link>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => askPassword(r)}
                        disabled={deletingId === r.id}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-status-error active:bg-surface-container-high disabled:opacity-40"
                      >
                        <Icon name="delete" className="text-lg" />
                        <span className="text-xs font-bold">
                          {deletingId === r.id ? "지우는 중…" : "삭제"}
                        </span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* md 이상 — 원래 표. 그대로 둔다. */}
            <div className="hidden md:block overflow-x-auto">
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
                      {/* 종류를 색 배지로 — 전체 조회처럼 섞여 나올 때 줄을 훑기만 해도 갈린다 */}
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          DOC_TYPE_BADGE[r.doc_type] ?? "bg-surface-container-highest text-on-surface-variant"
                        }`}
                      >
                        {MODE_LABELS[r.doc_type] ?? r.doc_type}
                      </span>
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
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => void open(r)}
                          className="inline-flex items-center gap-1 text-primary font-bold hover:underline whitespace-nowrap"
                        >
                          <Icon name="open_in_new" className="text-base" />
                          열기
                        </button>
                        {/*
                          source_id 가 있는 행만 — 03-docgen-sources.sql 을 실행한
                          뒤에 작성된 문서만 다시 채워 넣을 원본을 갖고 있다. 예전
                          문서는 PDF 뿐이라 이 버튼 자체를 보여주지 않는다.
                        */}
                        {r.source_id && (
                          <Link
                            href={`${EDIT_PATH[r.doc_type]}?edit=${r.source_id}`}
                            className="inline-flex items-center gap-1 text-on-surface-variant font-bold hover:underline hover:text-on-surface whitespace-nowrap"
                          >
                            <Icon name="edit" className="text-base" />
                            수정
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => askPassword(r)}
                            disabled={deletingId === r.id}
                            className="inline-flex items-center gap-1 text-status-error font-bold hover:underline whitespace-nowrap disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            <Icon name="delete" className="text-base" />
                            {deletingId === r.id ? "지우는 중…" : "삭제"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>

      {/* ---- 삭제 암호 확인 ----
          window.confirm 대신 창을 띄우는 이유: 암호를 가린 채(type="password")
          받아야 하고, 틀렸을 때 창을 닫지 않고 다시 묻기 위해서다. */}
      {pendingRow && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delDlgTitle"
          onClick={closeAsk}
        >
          <form
            onSubmit={submitPassword}
            // 창 안을 눌렀을 때 바깥 클릭으로 닫히지 않게 한다
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-start gap-3">
              <Icon name="warning" className="text-status-error text-2xl shrink-0" />
              <div className="min-w-0">
                <h3 id="delDlgTitle" className="text-title-sm text-on-surface">
                  문서를 삭제할까요?
                </h3>
                <p className="text-sm text-on-surface-variant mt-1 break-words">
                  <strong className="text-on-surface">{pendingRow.file_name}</strong>
                </p>
                <p className="text-sm text-on-surface-variant mt-1">
                  저장된 PDF 까지 함께 지워지며 되돌릴 수 없습니다.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="delPw" className="text-xs font-bold text-on-surface-variant">
                삭제 암호
              </label>
              <input
                id="delPw"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwError(null);
                }}
                autoFocus
                autoComplete="off"
                className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
              />
              {pwError && (
                <p className="text-sm font-bold text-status-error flex items-center gap-1.5">
                  <Icon name="error" className="text-base" />
                  {pwError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeAsk}>
                취소
              </Button>
              <Button type="submit" variant="danger" disabled={password.length === 0}>
                <Icon name="delete" className="text-lg" />
                삭제
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
