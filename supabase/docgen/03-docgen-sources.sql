-- ============================================================================
-- 문서 자동생성(docgen) — 보관함 문서 "수정" 기능
--
-- 실행 대상: Supabase 프로젝트 **"통합본-1"** (01-docgen-schema.sql 을 실행한 곳)
--            SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 안전하다.
--
-- ---------------------------------------------------------------------------
-- 무엇을 더하는가
-- ---------------------------------------------------------------------------
-- 지금까지 보관함에는 완성된 PDF 한 장만 올라갔다. PDF 는 그림이라 그 안의
-- "목적 텍스트", "사진별 설명", 마킹하기 전 원본 사진 같은 입력값을 다시 꺼낼
-- 수 없다 — 그래서 한 번 출력한 문서는 고칠 수 없었다.
--
-- 이 파일을 실행한 뒤부터 작성하는 문서는, PDF 와 별개로 그 입력값 전체(사진
-- 원본 + 모든 칸의 글)를 새 테이블·새 버킷에 함께 저장한다. 보관함에서 그
-- 문서를 다시 열면 작성 화면이 그대로 채워진 채로 뜬다 — 고쳐서 다시 출력하면
-- 새 버전으로 쌓인다(기존 문서는 그대로 남는다. 02 의 삭제와 달리 이 기능은
-- UPDATE/DELETE 권한이 전혀 필요 없다 — 매번 새 행만 추가한다).
--
-- ⚠️ 이미 보관함에 있는 예전 문서들은 이 기능이 적용되지 않는다. 입력값 자체가
-- 저장된 적이 없어서(완성 PDF 만 있었다) 되살릴 수가 없다. 그 문서들을 고치려면
-- 손으로 다시 작성해야 한다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 입력값 테이블
--    PDF(docgen_documents)와 완전히 분리된 새 테이블·새 버킷에 둔다(요청사항).
--    meta/items 는 화면의 saveMeta·items 배열을 거의 그대로 JSON 으로 담는다 —
--    컬럼을 늘릴 때마다 여기도 고칠 필요가 없게 하기 위해서다.
-- ---------------------------------------------------------------------------
create table if not exists public.docgen_document_sources (
  id            uuid primary key default gen_random_uuid(),

  -- 같은 문서의 "개정 이력"을 묶는 값. 처음 저장할 때 새로 만들고, 그 문서를
  -- 수정해서 다시 저장할 때는 이전 버전의 lineage_id 를 그대로 물려받는다.
  -- docgen_documents.lineage_id 와 같은 값이 들어가, PDF 쪽에서도 "같은 문서의
  -- 몇 번째 버전인지"를 조인 없이 바로 알 수 있다.
  lineage_id    uuid        not null,
  -- 바로 이전 버전의 id. 첫 저장이면 null.
  revises       uuid references public.docgen_document_sources(id),

  doc_type      text        not null check (doc_type in ('report', 'manual', 'fault')),
  file_name     text        not null,
  title         text        not null,
  author_name   text,
  created_at    timestamptz not null default now(),

  -- DocEditor 의 saveMeta + draftExtra 를 그대로 (지사·분야·매뉴얼 1~4번 항목 등)
  meta          jsonb       not null default '{}'::jsonb,
  -- DocItem[] — 사진은 {kind:"photo", storage_path, desc, strokes, rotation, ...},
  -- 텍스트 칸은 {kind:"text", body}. storage_path 는 아래 버킷 안의 경로다.
  items         jsonb       not null default '[]'::jsonb
);

comment on table public.docgen_document_sources is
  '보관함 문서의 "다시 열어 고칠 수 있는" 원본 입력값. PDF(docgen_documents)와 1:1은
   아니다 — 한 source 로 PDF 출력을 여러 번 했을 수도 있다(수정 없이 재출력).';

create index if not exists docgen_document_sources_lineage_idx
  on public.docgen_document_sources (lineage_id, created_at desc);

grant usage on schema public to anon, authenticated;
grant select, insert on public.docgen_document_sources to anon, authenticated;

alter table public.docgen_document_sources enable row level security;

drop policy if exists "docgen_sources_select_all" on public.docgen_document_sources;
create policy "docgen_sources_select_all"
  on public.docgen_document_sources for select
  to anon, authenticated
  using (true);

drop policy if exists "docgen_sources_insert_all" on public.docgen_document_sources;
create policy "docgen_sources_insert_all"
  on public.docgen_document_sources for insert
  to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. 원본 사진 버킷 — 'docgen-documents'(완성 PDF)와 분리된 전용 버킷
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('docgen-sources', 'docgen-sources', false)
on conflict (id) do nothing;

drop policy if exists "docgen_sources_storage_read" on storage.objects;
create policy "docgen_sources_storage_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'docgen-sources');

drop policy if exists "docgen_sources_storage_insert" on storage.objects;
create policy "docgen_sources_storage_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'docgen-sources');

-- ---------------------------------------------------------------------------
-- 3. docgen_documents(PDF 테이블)에 연결 컬럼 추가
--    기존 테이블이라 alter 로 붙인다. 둘 다 nullable — 이 기능 이전에 저장된
--    행은 null 로 남고, 보관함 화면은 null 이면 [수정] 버튼을 그리지 않는다.
-- ---------------------------------------------------------------------------
alter table public.docgen_documents
  add column if not exists lineage_id uuid,
  add column if not exists source_id  uuid references public.docgen_document_sources(id);

create index if not exists docgen_documents_lineage_idx
  on public.docgen_documents (lineage_id);

-- ============================================================================
-- 확인 — 아래가 각각 0건(오류 없이 조회됨)이면 정상
-- ============================================================================
--   select count(*) from public.docgen_document_sources;
--   select id, public from storage.buckets where id = 'docgen-sources';
--   select lineage_id, source_id from public.docgen_documents limit 1;

-- ============================================================================
-- 전부 되돌리기
-- ============================================================================
--   alter table public.docgen_documents drop column if exists source_id;
--   alter table public.docgen_documents drop column if exists lineage_id;
--   drop policy if exists "docgen_sources_storage_read"   on storage.objects;
--   drop policy if exists "docgen_sources_storage_insert" on storage.objects;
--   delete from storage.objects where bucket_id = 'docgen-sources';
--   delete from storage.buckets  where id = 'docgen-sources';
--   drop table if exists public.docgen_document_sources;
