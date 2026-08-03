import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트.
 *
 * 이 앱은 로그인이 없으므로(개발 단계 결정) 브라우저에서 DB에 직접 붙지 않는다.
 * 모든 데이터 접근은 API Route / 서버 컴포넌트를 거쳐 service role 키로만 이뤄진다.
 * service role 키는 RLS를 우회하므로 절대 클라이언트 번들에 들어가면 안 된다
 * (그래서 이 파일은 "server-only"로 잠가둔다).
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local.example을 복사해 .env.local을 만들고 " +
        "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** 환경변수가 설정되어 있는지 — 미설정 시 화면에서 안내 문구를 띄우기 위한 체크 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Storage 버킷 이름 — supabase/schema.sql 의 버킷 정의와 맞춰둔다 */
export const BUCKETS = {
  /** 고장이력 첨부파일 */
  failureAttachments: "failure-attachments",
  /** 실적입력 분해 전/후 사진 */
  overhaulPhotos: "overhaul-photos",
  /** 준공도서·벤더프린트 PDF */
  documents: "documents",
} as const;
