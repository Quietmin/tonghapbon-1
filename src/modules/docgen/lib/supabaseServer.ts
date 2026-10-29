/**
 * 문서 자동생성(docgen) 전용 Supabase 클라이언트 — **서버(Route Handler)용**.
 *
 * ./supabase.ts 는 "use client" 라 브라우저 전용이다. 챗봇 색인·검색 라우트는
 * OpenAI 임베딩 API를 불러야 해서(키를 브라우저에 보낼 수 없다) 서버에서
 * 돌아야 하고, 그 서버 코드가 쓸 별도의(그러나 설정은 완전히 같은) 클라이언트가
 * 필요해 이 파일을 나눴다.
 *
 * 키는 여기서도 anon 키만 쓴다 — service_role 은 어떤 경우에도 넣지 않는다
 * (RLS가 전부 우회된다). anon 키로 insert 가 되는 건 01/03/04 SQL이 이미
 * anon 에게 select/insert 를 열어 뒀기 때문이고, 그 신뢰 모델을 서버 쪽에서도
 * 그대로 따른다 — 브라우저 쪽 작성 화면이 이미 같은 권한으로 직접 저장하고
 * 있으므로, 여기서만 특별히 더 위험해지는 게 아니다.
 */
import { createClient } from "@supabase/supabase-js";

export const DOCGEN_TABLE = "docgen_documents";
export const DOCGEN_SOURCE_TABLE = "docgen_document_sources";
export const DOCGEN_CHUNK_TABLE = "docgen_document_chunks";

export function isDocgenSupabaseConfiguredServer(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_URL && process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY);
}

/** 요청마다 새로 만든다 — Route Handler는 서버리스 함수라 브라우저처럼 싱글턴을 유지할 이유가 없다 */
export function getDocgenSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}
