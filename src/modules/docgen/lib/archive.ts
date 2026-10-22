"use client";

/**
 * 보관함 — 저장 / 조회.
 * 원본 legacy Photo-Report archive.js 를 이식하되, **로그인을 쓰지 않는다.**
 *
 * Supabase 프로젝트 "통합본-1" 의 docgen_documents 테이블 / 'docgen-documents'
 * 버킷만 쓴다. 뚝 DOC 은 별개 프로젝트이므로 어떤 경로로도 닿지 않는다.
 * supabase/docgen/01-docgen-schema.sql 을 통합본-1 에서 실행해 두어야 동작한다.
 *
 * 통합앱은 무인증이므로 author_id 는 항상 null 로 넣고, 작성자는 사용자가 직접
 * 입력한 이름(author_name)으로만 남는다.
 *
 * 수정은 제공하지 않는다. 삭제는 supabase/docgen/02-docgen-delete.sql 을 실행한
 * 프로젝트에서만 동작한다 — 그 파일을 실행하기 전까지 서버가 조용히 막는다
 * (deleteFromArchive 주석 참고).
 */
import { DOCGEN_BUCKET, DOCGEN_TABLE, getDocgenSupabase } from "./supabase";
import type { DocMode } from "./constants";
import { buildStoragePath, withSuffix } from "./storagePath";

/** 동명 파일 자동 증가 재시도 상한 (원본과 동일) */
const MAX_UPLOAD_ATTEMPTS = 50;

export interface ArchiveRow {
  id: string;
  doc_type: DocMode;
  file_name: string;
  title: string;
  author_name: string | null;
  created_at: string;
  pdf_path: string;
  pdf_bytes: number | null;
  page_count: number | null;
  photo_count: number;
  manual_type: string | null;
  field: string | null;
  revision: string | null;
  year: number | null;
  branch: string | null;
  facility: string | null;
  fault_content: string | null;
  /**
   * "수정 가능한 원본"이 있으면(source.ts) 채워진다. 03-docgen-sources.sql 을
   * 실행하기 전에 저장된 행은 둘 다 null — 그 행은 [수정] 버튼을 못 그린다.
   */
  lineage_id: string | null;
  source_id: string | null;
}

/** 저장 시 함께 넣는 메타 — documents 테이블 컬럼명과 맞춘다 */
export interface SaveMeta {
  doc_type: DocMode;
  file_name: string;
  title: string;
  /** 비로그인이라 검증되지 않은 자유 입력값 */
  author_name?: string;
  page_count: number;
  photo_count: number;
  branch?: string;
  field?: string;
  manual_type?: string;
  revision?: string;
  year?: number;
  // 고장 보고서 전용
  occurred_at?: string | null;
  facility?: string;
  device?: string;
  fault_content?: string;
  situation?: string;
  cause?: string;
  recover_at?: string | null;
  recover_note?: string;
  action_taken?: string;
  outage_none?: boolean;
  /** 비었으면 null — 0 으로 넣으면 "0세대 중단"으로 읽힌다 */
  outage_apt?: number | null;
  outage_bldg?: number | null;
  outage_at?: string | null;
  outage_mins?: number | null;
}

/**
 * Supabase Storage 가 upsert:false 에서 기존 경로와 충돌할 때 주는 오류 판별.
 * SDK 버전에 따라 문구가 다를 수 있어 메시지와 상태코드를 함께 본다. (원본 주석)
 */
function isDuplicatePathError(err: unknown): boolean {
  const e = err as { message?: string; error?: string; statusCode?: unknown; status?: unknown };
  const msg = `${e?.message ?? e?.error ?? ""}`;
  const status = e?.statusCode ?? e?.status;
  return /already exists|duplicate/i.test(msg) || status === 409 || status === "409";
}

/**
 * 동명 파일이 있으면 (2), (3)... 순으로 자동 증가시켜 재시도한다.
 * 조용히 처리해야 하므로 여기서는 어떤 UI도 건드리지 않는다. (원본 주석)
 */
async function uploadWithRetry(basePath: string, pdfBlob: Blob): Promise<string> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  for (let n = 1; n <= MAX_UPLOAD_ATTEMPTS; n++) {
    const path = n === 1 ? basePath : withSuffix(basePath, n);
    const { error } = await client.storage
      .from(DOCGEN_BUCKET)
      .upload(path, pdfBlob, { contentType: "application/pdf", upsert: false });

    if (!error) return path;
    if (!isDuplicatePathError(error)) throw error;
  }
  throw new Error("같은 이름의 문서가 너무 많습니다. 파일명을 바꿔 주세요.");
}

/**
 * PDF 를 스토리지에 올리고 documents 행을 만든다.
 * 실패하면 올라간 파일을 되돌려 고아 파일이 남지 않게 한다(원본과 동일).
 *
 * link 는 source.ts 가 같은 출력 과정에서 저장한 "수정 가능한 원본" 행과
 * 이 PDF 행을 이어 준다 — 보관함이 [수정] 버튼을 그릴지는 이 두 컬럼이
 * 채워졌는지로 판단한다. 03-docgen-sources.sql 을 실행하지 않았으면(컬럼이
 * 없으면) link 를 넘기지 않으면 그만이다 — PDF 저장 자체는 그대로 된다.
 */
export async function saveToArchive(
  pdfBlob: Blob,
  meta: SaveMeta,
  link?: { lineageId: string; sourceId: string },
): Promise<void> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  const year = meta.year ?? new Date().getFullYear();
  const basePath = buildStoragePath({
    docType: meta.doc_type,
    branch: meta.branch,
    field: meta.field,
    manualType: meta.manual_type,
    title: meta.title,
    year,
  });

  const path = await uploadWithRetry(basePath, pdfBlob);

  const { error } = await client.from(DOCGEN_TABLE).insert({
    ...meta,
    year,
    // 무인증이므로 참조할 auth.users 행이 없다 — 항상 null
    author_id: null,
    author_name: meta.author_name?.trim() || null,
    pdf_path: path,
    pdf_bytes: pdfBlob.size,
    ...(link ? { lineage_id: link.lineageId, source_id: link.sourceId } : {}),
  });

  if (error) {
    // 행 생성이 실패했으면 올린 파일도 치운다
    await client.storage.from(DOCGEN_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

/**
 * 보관함에서 문서를 지운다 — 행과 저장된 PDF 를 함께.
 * 원본 legacy Photo-Report archive.js 의 deleteDocument() 를 그대로 옮겼다.
 *
 * ⚠️ RLS 는 "권한 없음"을 오류로 알려주지 않는다. using 조건에 맞지 않는 행은 그냥
 * 0건 삭제로 끝나고 error 가 비어 있다. 그대로 두면 화면에는 "지웠습니다"가 뜨고
 * 목록에서도 사라지는데 실제로는 남아 있어서, 다시 조회하면 되살아난 것처럼 보인다.
 * 그래서 .select() 로 실제 지워진 행을 돌려받아 비어 있으면 직접 오류를 던진다.
 *
 * 파일 삭제도 마찬가지다. storage.remove() 는 실패해도 예외를 던지지 않고
 * {data, error} 만 돌려주며, 삭제 정책이 없으면 error 조차 비어 있고 data 가 빈
 * 배열로 온다. 지워진 개수까지 확인해서 호출한 쪽에 fileRemoved 로 알린다 —
 * 행은 지웠는데 PDF 만 남는 경우를 조용히 넘기지 않기 위해서다.
 *
 * 순서는 행 → 파일이다. 파일을 먼저 지우면, 행 삭제가 막혔을 때 목록에는 남아
 * 있는데 열면 깨지는 문서가 된다.
 */
export async function deleteFromArchive(
  row: Pick<ArchiveRow, "id" | "pdf_path">,
): Promise<{ fileRemoved: boolean }> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  const { data, error } = await client
    .from(DOCGEN_TABLE)
    .delete()
    .eq("id", row.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "삭제 권한이 없습니다 — 서버에 삭제 정책(RLS)이 없습니다. " +
        "Supabase SQL Editor 에서 supabase/docgen/02-docgen-delete.sql 을 한 번 실행해 주세요.",
    );
  }

  try {
    const res = await client.storage.from(DOCGEN_BUCKET).remove([row.pdf_path]);
    return { fileRemoved: !res.error && (res.data?.length ?? 0) > 0 };
  } catch {
    return { fileRemoved: false };
  }
}

/**
 * 조회 조건 — 원본 legacy Photo-Report archive.js 의 queryDocuments(filters) 와
 * 같은 묶음이다. 고르는 값(지사·분야·매뉴얼 종류)은 정확히 일치로,
 * 손으로 적는 값(설비명·고장내용·파일명·작성자)은 부분검색으로 찾는다
 * (파일명·고장내용·설비명에는 pg_trgm 인덱스가 깔려 있다).
 */
export interface ListFilter {
  docType?: DocMode | "";
  branch?: string;
  field?: string;
  /** 매뉴얼 전용 */
  manualType?: string;
  /** 고장 보고서 전용 */
  facility?: string;
  faultContent?: string;
  /** 부분검색 */
  fileName?: string;
  authorName?: string;
  /**
   * 최대 건수. 챕터 첫 화면의 "최근 문서" 요약처럼 몇 건만 필요할 때 쓴다 —
   * 200건을 받아 와서 잘라 쓰면 그만큼이 그냥 버려진다.
   */
  limit?: number;
}

export async function listArchive(filter: ListFilter = {}): Promise<ArchiveRow[]> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  let q = client
    .from(DOCGEN_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);

  const like = (v?: string) => {
    const t = v?.trim();
    return t ? `%${t}%` : null;
  };

  if (filter.docType) q = q.eq("doc_type", filter.docType);
  if (filter.manualType) q = q.eq("manual_type", filter.manualType);
  if (filter.field) q = q.eq("field", filter.field);
  // 지사는 목록에서 고르는 값이지만, 예전에 저장된 행에 공백 같은 흔들림이 있을 수
  // 있어 원본처럼 부분일치로 찾는다 (정확히 일치로 두면 그런 행이 조용히 빠진다)
  const branch = like(filter.branch);
  if (branch) q = q.ilike("branch", branch);
  const facility = like(filter.facility);
  if (facility) q = q.ilike("facility", facility);
  const faultContent = like(filter.faultContent);
  if (faultContent) q = q.ilike("fault_content", faultContent);
  const fileName = like(filter.fileName);
  if (fileName) q = q.ilike("file_name", fileName);
  const authorName = like(filter.authorName);
  if (authorName) q = q.ilike("author_name", authorName);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ArchiveRow[];
}

/** 비공개 버킷이므로 서명 URL 로 열어야 한다 (기본 1시간) */
export async function getSignedUrl(path: string, seconds = 3600): Promise<string> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  const { data, error } = await client.storage
    .from(DOCGEN_BUCKET)
    .createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}
