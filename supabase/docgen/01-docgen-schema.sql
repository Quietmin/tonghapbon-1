-- ============================================================================
-- 문서 자동생성(docgen) — 보관함 스키마
--
-- 실행 대상: Supabase 프로젝트 **"통합본-1"** (Plant Ops Hub 전용)
--            SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 안전하다.
--
-- ---------------------------------------------------------------------------
-- ⛔ 뚝 DOC 프로젝트에서는 실행하지 말 것
-- ---------------------------------------------------------------------------
-- 뚝 DOC(legacy Photo-Report)은 별개로 운영되는 웹앱이고, 자체 Supabase 프로젝트를
-- 쓴다. 이 파일은 통합본-1 프로젝트에만 실행한다. 두 앱은
--
--   • 프로젝트가 다르므로 테이블·버킷·정책·용량이 완전히 분리된다
--   • 보관함이 섞이지 않는다 (뚝 DOC 의 목록 조회에는 작성자 필터가 없어서,
--     같은 테이블을 쓰면 반드시 섞인다 — 그래서 프로젝트를 나눴다)
--   • anon 키도 다르므로 한쪽 키로 다른 쪽에 접근할 수 없다
--
-- ---------------------------------------------------------------------------
-- 이름에 docgen_ 접두어를 붙인 이유
-- ---------------------------------------------------------------------------
-- 통합본-1 은 통합앱 전체가 쓰는 프로젝트다. 다른 담당자(오버홀·고장이력·챗봇)가
-- 같은 프로젝트에 자기 테이블을 만든다. 특히 통합앱의 supabase/schema.sql 에는
-- 이미 document 테이블과 'documents' 버킷이 정의되어 있다(준공도서용).
-- 그래서 문서 자동생성 자산에는 docgen_ / docgen- 접두어를 붙여 충돌을 피한다.
--
-- ---------------------------------------------------------------------------
-- ⚠️ 보안 수준 (알고 실행할 것)
-- ---------------------------------------------------------------------------
-- 통합앱은 로그인이 없다(개발 단계 결정). 따라서 anon 키를 아는 누구나 보관함을
-- 조회·저장할 수 있다. 고장 보고서에는 지사·설비명·고장내용이 들어가므로,
-- 사내망 전용이 아니라면 이 점을 감안해야 한다.
--
-- 삭제·수정은 열지 않는다 — 무인증에서 열면 아무나 보관함 전체를 되돌릴 수 없이
-- 비울 수 있다. 필요해지면 맨 아래 주석 참고.
-- ============================================================================

-- 한글 부분검색(파일명·고장내용·설비명)용 확장
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. 보관함 테이블
--    컬럼 구성은 뚝 DOC 의 documents 와 같게 두었다 — 나중에 뚝 DOC 문서를
--    이 앱으로 옮기거나 대조할 때 매핑이 1:1 로 유지되도록.
--    다른 점: 로그인이 없으므로 auth.users FK 를 걸지 않고, 작성자는 nullable.
-- ---------------------------------------------------------------------------
create table if not exists public.docgen_documents (
  id            uuid primary key default gen_random_uuid(),

  -- 공통
  doc_type      text        not null check (doc_type in ('report', 'manual', 'fault')),
  file_name     text        not null,
  title         text        not null,
  -- 로그인이 없어 사용자가 직접 입력한다. 검증되지 않으므로 신원 증명으로 쓰면 안 된다.
  author_name   text,
  -- 나중에 로그인을 도입하면 auth.users.id 를 넣는다. 지금은 항상 null.
  author_id     uuid,
  created_at    timestamptz not null default now(),

  -- 저장된 PDF ('docgen-documents' 버킷 내 경로)
  pdf_path      text        not null,
  pdf_bytes     integer,
  page_count    integer,
  photo_count   integer     not null default 0,

  -- 매뉴얼 전용
  manual_type   text,
  field         text,
  revision      text,

  -- 저장 경로용 — docgen-documents/{지사}/{연도}/{분야}/{종류}/{제목}.pdf
  year          integer,

  -- 고장 보고서 전용
  occurred_at   timestamptz,
  branch        text,
  facility      text,
  device        text,
  fault_content text,
  situation     text,
  cause         text,
  recover_at    timestamptz,
  recover_note  text,
  action_taken  text,
  outage_none   boolean,
  outage_apt    integer,
  outage_bldg   integer,
  outage_at     timestamptz,
  outage_mins   integer
);

comment on table public.docgen_documents is
  'Plant Ops Hub 문서 자동생성 보관함(사진대장·매뉴얼·고장 보고서). 뚝 DOC 은 별개 프로젝트를 쓴다.';
comment on column public.docgen_documents.author_name is
  '작성자 이름. 로그인이 없어 사용자가 직접 입력하며 검증되지 않는다.';
comment on column public.docgen_documents.outage_mins is
  '기간을 분 단위 정수로 저장해 정렬·집계가 가능하게 함';

-- 정렬·필터용
create index if not exists docgen_documents_created_at_idx
  on public.docgen_documents (created_at desc);
create index if not exists docgen_documents_filter_idx
  on public.docgen_documents (doc_type, branch, year);

-- 부분검색용 (앱에서 ilike 로 조회한다)
create index if not exists docgen_documents_file_name_trgm
  on public.docgen_documents using gin (file_name gin_trgm_ops);
create index if not exists docgen_documents_fault_content_trgm
  on public.docgen_documents using gin (fault_content gin_trgm_ops);
create index if not exists docgen_documents_facility_trgm
  on public.docgen_documents using gin (facility gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. 권한 — 조회·저장만. 삭제·수정은 주지 않는다.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert on public.docgen_documents to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
--    RLS 를 켜 두면, 나중에 로그인을 도입할 때 정책만 갈아끼우면 된다.
--    (켜지 않으면 grant 만으로 전부 열려 되돌릴 지점이 없다)
-- ---------------------------------------------------------------------------
alter table public.docgen_documents enable row level security;

drop policy if exists "docgen_select_all" on public.docgen_documents;
create policy "docgen_select_all"
  on public.docgen_documents for select
  to anon, authenticated
  using (true);

drop policy if exists "docgen_insert_all" on public.docgen_documents;
create policy "docgen_insert_all"
  on public.docgen_documents for insert
  to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. Storage — 전용 버킷 'docgen-documents' (비공개)
--
--    비공개로 두고 서명 URL 로만 연다. public 으로 바꾸면 URL 을 아는 누구나
--    영구히 열 수 있어 되돌리기 어렵다.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('docgen-documents', 'docgen-documents', false)
on conflict (id) do nothing;

drop policy if exists "docgen_storage_read" on storage.objects;
create policy "docgen_storage_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'docgen-documents');

drop policy if exists "docgen_storage_insert" on storage.objects;
create policy "docgen_storage_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'docgen-documents');

-- 삭제 정책은 만들지 않는다.

-- ============================================================================
-- 확인 — 실행 후 아래를 돌려보면 0건이 나오면 정상(테이블·정책이 만들어진 상태)
-- ============================================================================
--   select count(*) from public.docgen_documents;
--   select id, public from storage.buckets where id = 'docgen-documents';

-- ============================================================================
-- 마이그레이션 — doc_type 체크 제약조건이 'photo' 로 만들어진 상태에서 이미
-- 테이블이 생성돼 있다면(위 create table 은 if not exists 라 재실행해도 바뀌지
-- 않는다) 아래를 한 번 실행해야 한다. 앱은 'report' | 'manual' | 'fault' 를
-- 쓰는데 예전 제약조건이 'photo' 를 기대해서, 사진대장(report) 저장이 매번
-- 체크 제약조건 위반으로 실패하고 있었다.
-- ============================================================================
--   alter table public.docgen_documents drop constraint if exists docgen_documents_doc_type_check;
--   alter table public.docgen_documents add constraint docgen_documents_doc_type_check
--     check (doc_type in ('report', 'manual', 'fault'));

-- ============================================================================
-- 필요해지면: 삭제를 허용하는 방법 (무인증이라 아무나 지울 수 있게 된다)
-- ============================================================================
--   grant delete on public.docgen_documents to anon, authenticated;
--   create policy "docgen_delete_all" on public.docgen_documents for delete
--     to anon, authenticated using (true);
--   create policy "docgen_storage_delete" on storage.objects for delete
--     to anon, authenticated using (bucket_id = 'docgen-documents');

-- ============================================================================
-- 전부 되돌리기
-- ============================================================================
--   drop policy if exists "docgen_storage_read"   on storage.objects;
--   drop policy if exists "docgen_storage_insert" on storage.objects;
--   delete from storage.objects where bucket_id = 'docgen-documents';
--   delete from storage.buckets  where id = 'docgen-documents';
--   drop table if exists public.docgen_documents;   -- 보관된 문서 행이 함께 사라진다
