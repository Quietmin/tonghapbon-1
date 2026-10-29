-- ============================================================================
-- 문서 자동생성(docgen) — 챗봇 내용 검색(임베딩)
--
-- 실행 대상: Supabase 프로젝트 **"통합본-1"** (01-docgen-schema.sql 을 실행한 곳)
--            SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 안전하다.
--
-- ---------------------------------------------------------------------------
-- 무엇을 더하는가
-- ---------------------------------------------------------------------------
-- 매뉴얼·고장보고서를 PDF로 출력해 보관함에 저장할 때, 03-docgen-sources.sql 이
-- 만든 "수정 가능한 원본"(docgen_document_sources.meta/items — 목적·준비물·
-- 주의사항, 사진 설명란 등 원문 텍스트)에서 뜻을 담은 조각을 뽑아 OpenAI
-- 임베딩으로 벡터화해 여기 저장한다. 챗봇이 질문을 받으면 같은 방식으로
-- 질문을 벡터화해, 가장 가까운 조각을 가진 문서를 찾아 보여준다.
--
-- PDF 는 그림이라 글자를 못 읽지만, 이 조각은 원본 텍스트 그대로다 — 그래서
-- PDF를 다시 열어 글자를 추출(OCR)할 필요가 없다.
--
-- ⚠️ 03-docgen-sources.sql 을 먼저 실행해 두어야 한다(docgen_document_sources 를
-- 읽어야 색인할 텍스트를 구할 수 있다). 그 전에 저장된 문서는 원본 텍스트 자체가
-- 없어 색인되지 않는다 — 검색에서 빠질 뿐, 보관함 조회·PDF 열람에는 영향 없다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. pgvector 확장
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. 조각 테이블
--    한 문서(docgen_documents 한 행)가 여러 조각(목적/준비물/사진 설명 등)을
--    가진다. document_id 로 묶어, 검색 결과를 "조각"이 아니라 "문서" 단위로
--    모아서 보여줄 수 있게 한다.
--
--    text-embedding-3-small 기준 1536차원. 모델을 바꾸면 이 숫자도 같이
--    바꿔야 한다(이미 쌓인 벡터는 차원이 다르면 비교가 안 되므로 재색인 필요).
-- ---------------------------------------------------------------------------
create table if not exists public.docgen_document_chunks (
  id            uuid primary key default gen_random_uuid(),
  -- on delete cascade — 이 프로젝트는 이미 02-docgen-delete.sql로 docgen_documents
  -- 삭제를 열어 둔 상태다(보관함 화면의 [삭제] 버튼). 그 삭제가 이 조각들까지
  -- 자동으로 치우지 않으면, 조각이 하나라도 딸린 문서는 외래키 위반으로 삭제
  -- 자체가 막혀 버린다 — 이미 있는 기능을 04가 조용히 깨뜨리는 셈이라 반드시 넣는다.
  document_id   uuid not null references public.docgen_documents(id) on delete cascade,
  source_id     uuid references public.docgen_document_sources(id) on delete set null,
  doc_type      text not null check (doc_type in ('report', 'manual', 'fault')),
  -- 조각이 어디서 나왔는지 (예: "목적", "사진 3 설명") — 검색 결과 스니펫용
  label         text not null,
  chunk_text    text not null,
  embedding     vector(1536) not null,
  created_at    timestamptz not null default now()
);

-- 이미 이 파일을 실행해 테이블이 만들어져 있었다면(위 create table은 if not exists라
-- 재실행해도 제약조건이 안 바뀐다) 아래로 기존 제약을 cascade로 바꾼다. 처음
-- 실행하는 경우에는 테이블이 방금 cascade로 만들어졌으니 이 블록은 그냥 아무 일도
-- 하지 않는다(제약이 없으면 drop도 조용히 넘어간다).
alter table public.docgen_document_chunks
  drop constraint if exists docgen_document_chunks_document_id_fkey;
alter table public.docgen_document_chunks
  add constraint docgen_document_chunks_document_id_fkey
  foreign key (document_id) references public.docgen_documents(id) on delete cascade;

comment on table public.docgen_document_chunks is
  '챗봇 내용 검색용 — docgen_document_sources 의 원문 텍스트를 조각내 임베딩한 것.
   docgen_documents(완성 PDF)와 document_id 로 연결된다.';

create index if not exists docgen_document_chunks_document_idx
  on public.docgen_document_chunks (document_id);

-- 벡터 전용 색인(ivfflat/hnsw)은 일부러 만들지 않는다 — 문서 수가 적을 때는
-- 전체 스캔(<=> 연산자)으로도 충분히 빠르고, ivfflat은 데이터가 어느 정도
-- 쌓인 뒤 분석(ANALYZE)해야 효과가 있다. 문서량이 늘어 느려지면 그때
--   create index ... using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- 을 추가하면 된다.

grant usage on schema public to anon, authenticated;
grant select, insert on public.docgen_document_chunks to anon, authenticated;

alter table public.docgen_document_chunks enable row level security;

drop policy if exists "docgen_chunks_select_all" on public.docgen_document_chunks;
create policy "docgen_chunks_select_all"
  on public.docgen_document_chunks for select
  to anon, authenticated
  using (true);

drop policy if exists "docgen_chunks_insert_all" on public.docgen_document_chunks;
create policy "docgen_chunks_insert_all"
  on public.docgen_document_chunks for insert
  to anon, authenticated
  with check (true);

-- 삭제도 같이 연다 — docgen_documents는 이미 02로 삭제가 열려 있는 프로젝트다. RLS가
-- 켜진 테이블은 FK의 on delete cascade라도 이 테이블 자체에 삭제 정책이 없으면
-- 조용히 아무것도 안 지워질 수 있다(이 프로젝트에서 실제로 그렇게 확인됐다) —
-- 그러면 문서는 지워졌는데 조각만 고아로 남는다. 조각 자체는 재색인하면 다시
-- 만들 수 있는 파생 데이터라, 02처럼 별도 파일로 나눌 만큼 위험하지 않다고 보고
-- 여기 바로 넣는다.
grant delete on public.docgen_document_chunks to anon, authenticated;

drop policy if exists "docgen_chunks_delete_all" on public.docgen_document_chunks;
create policy "docgen_chunks_delete_all"
  on public.docgen_document_chunks for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. 검색 함수
--    코사인 거리(<=>)가 가까운(= 유사도가 높은) 조각을 가까운 순으로 돌려준다.
--    filter_doc_type 을 주면 그 종류(매뉴얼/고장보고서)로만 좁힌다.
-- ---------------------------------------------------------------------------
create or replace function public.match_docgen_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_doc_type text default null
)
returns table (
  document_id uuid,
  label       text,
  chunk_text  text,
  similarity  float
)
language sql stable
as $$
  select
    c.document_id,
    c.label,
    c.chunk_text,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.docgen_document_chunks c
  where filter_doc_type is null or c.doc_type = filter_doc_type
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_docgen_chunks(vector, int, text) to anon, authenticated;

-- ============================================================================
-- 확인 — 아래가 각각 오류 없이(0건이어도 정상) 조회되면 정상
-- ============================================================================
--   select count(*) from public.docgen_document_chunks;
--   select proname from pg_proc where proname = 'match_docgen_chunks';
--   select confdeltype from pg_constraint
--    where conname = 'docgen_document_chunks_document_id_fkey'; -- 'c'(cascade)여야 정상

-- ============================================================================
-- 전부 되돌리기
-- ============================================================================
--   drop function if exists public.match_docgen_chunks(vector, int, text);
--   drop table if exists public.docgen_document_chunks;
--   -- vector 확장은 다른 테이블이 쓸 수도 있으니 보통은 그대로 둔다. 정말 필요하면:
--   -- drop extension if exists vector;
