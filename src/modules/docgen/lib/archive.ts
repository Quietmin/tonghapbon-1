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
 * 삭제·수정은 제공하지 않는다 — 비로그인에서 열면 아무나 보관함을 비울 수 있다.
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
 */
export async function saveToArchive(pdfBlob: Blob, meta: SaveMeta): Promise<void> {
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
  });

  if (error) {
    // 행 생성이 실패했으면 올린 파일도 치운다
    await client.storage.from(DOCGEN_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

export interface ListFilter {
  docType?: DocMode | "";
  branch?: string;
  year?: string;
  /** 파일명·고장내용·설비명 부분검색 (원본은 pg_trgm 인덱스를 깔아 둠) */
  keyword?: string;
}

export async function listArchive(filter: ListFilter = {}): Promise<ArchiveRow[]> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  let q = client.from(DOCGEN_TABLE).select("*").order("created_at", { ascending: false }).limit(200);

  if (filter.docType) q = q.eq("doc_type", filter.docType);
  if (filter.branch) q = q.eq("branch", filter.branch);
  if (filter.year) q = q.eq("year", Number(filter.year));
  if (filter.keyword?.trim()) {
    const kw = `%${filter.keyword.trim()}%`;
    q = q.or(`file_name.ilike.${kw},fault_content.ilike.${kw},facility.ilike.${kw}`);
  }

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
