/**
 * 문서 자동생성(docgen) 전용 Supabase 클라이언트 — **브라우저용**.
 *
 * ⚠️ 통합앱의 다른 모듈(오버홀·고장이력·챗봇)은 Supabase 를 쓰지 않는다 —
 *    커밋 d402d23 에서 순수 PostgreSQL(DATABASE_URL / PGlite)로 정리되면서
 *    shared/lib/supabase.ts 가 사라졌다. Supabase 를 직접 쓰는 곳은 여기뿐이다.
 *    PDF 원본을 Storage 에 보관해야 하는데 Postgres 연결만으로는 파일 저장소가
 *    없기 때문이다. 이 파일은 anon 키 · 브라우저 사용 · RLS 적용이 전제다.
 *
 * 이 모듈은 Supabase 프로젝트 **"통합본-1"** 을 쓴다.
 *
 * ⛔ 뚝 DOC(legacy Photo-Report)은 별개로 계속 운영되는 웹앱이고 자체 프로젝트를
 *    쓴다. 여기에 뚝 DOC 프로젝트의 URL·키를 넣으면 두 앱의 보관함이 섞이고
 *    뚝 DOC 에 영향이 간다 — 프로젝트를 나눈 이유가 그것이다.
 *
 *    테이블·버킷에 docgen_ / docgen- 접두어를 붙인 이유는 통합본-1 이 나중에
 *    다른 담당자와 함께 쓰이게 되어도 이름이 겹치지 않게 하기 위해서다.
 *
 *    필요한 SQL: supabase/docgen/01-docgen-schema.sql (통합본-1 에서 실행)
 *
 * 다른 모듈의 DATABASE_URL 을 여기서 참조하면 안 된다. NEXT_PUBLIC_DOCGEN_* 만 읽는다.
 *
 * anon 키가 브라우저에 노출되는 것은 의도된 설계다(공개돼도 안전한 키).
 * 실제 보안은 Supabase 쪽 RLS 정책이 담당한다.
 * service_role 키는 어떤 경우에도 이 파일에 넣지 말 것 — 모든 정책을 우회한다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 생성한 PDF를 보관하는 전용 스토리지 버킷 (비공개 — 서명 URL 로만 연다) */
export const DOCGEN_BUCKET = "docgen-documents";

/** 전용 보관함 테이블 */
export const DOCGEN_TABLE = "docgen_documents";

let cached: SupabaseClient | null = null;

function env() {
  return {
    url: process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY,
  };
}

/**
 * 보관함 기능이 설정되어 있는지.
 * 원본과 동일하게, 미설정이면 앱은 "저장 없이" 정상 동작한다(PDF 생성·다운로드는 됨).
 */
export function isDocgenSupabaseConfigured(): boolean {
  const { url, anonKey } = env();
  return Boolean(url && anonKey);
}

/**
 * 브라우저용 클라이언트. 미설정이면 null — 호출부에서 보관함 UI를 숨기는 데 쓴다.
 * (throw 하지 않는다: 보관함은 선택 기능이고, 없어도 문서 생성은 되어야 한다)
 */
export function getDocgenSupabase(): SupabaseClient | null {
  if (cached) return cached;

  const { url, anonKey } = env();
  if (!url || !anonKey) return null;

  cached = createClient(url, anonKey);
  return cached;
}
