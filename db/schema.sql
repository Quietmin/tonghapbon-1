-- ============================================================================
-- Plant Ops Hub — 통합 DB 스키마 (PostgreSQL)
--
-- 특정 서비스에 묶이지 않은 순수 PostgreSQL이다. 지금은 PGlite(앱 안에서 도는
-- 임베디드 Postgres)로 로컬에서 실행하고, 계정·서버·클라우드가 필요 없다.
-- 나중에 데이터를 공유해야 할 때 어떤 Postgres에 붙이든 이 파일을 그대로 쓴다.
-- 여러 번 실행해도 안전하도록(idempotent) 작성했다.
--
-- 구성
--   1) 공통 설비 마스터   equipment → device
--   2) 오버홀 공정관리     overhaul_project / overhaul_source / overhaul_task / overhaul_entry
--   3) 고장이력 관리       failure_history / failure_attachment
--   4) 정비 챗봇           document / document_chunk / chat_message
--
-- 인증이 없는 개발 단계 구성이라 접근 제어(RLS)를 넣지 않았다. 운영 전환 시 필요하다.
-- ============================================================================

-- gen_random_uuid()는 Postgres 13부터 코어 내장이라 pgcrypto가 필요 없다.
create extension if not exists "pg_trgm";    -- 한국어 부분일치·유사도 검색

-- ── 한국어 검색 전략 (로컬 Postgres 18에서 실측 검증함) ──────────────────────
-- 질문 문장 전체를 similarity()로 비교하는 방식은 **작동하지 않는다.**
-- "유량 전송기 신호 튐"으로 "…유량 전송기 신호가 튀는 현상…"을 찾으면 결과 0건이다.
-- 조사·어미가 붙어 trigram 유사도가 기본 임계치(0.3)를 못 넘기 때문.
--
-- 실제로 쓰는 방식은 어절 분해 + 부분일치다:
--   1) 질문을 어절로 쪼갠다        → ['유량','전송기','신호','튐']
--   2) 어절별 ILIKE '%어절%'로 매칭 → 아래 GIN trgm 인덱스가 이걸 가속한다
--   3) 매칭된 어절 수로 순위를 매기고, word_similarity()를 가산점으로 더한다
--
-- 한계: 어미가 바뀐 말('튐' ↔ '튀는')은 이 방식으로도 못 잡는다.
-- 형태소 분석기가 없는 Postgres의 구조적 한계이며, 나중에 pgvector + 로컬 임베딩을
-- 얹을 때 해소된다. 그래서 아래 스키마는 embedding 컬럼만 추가하면 되도록 잡아뒀다.
-- ────────────────────────────────────────────────────────────────────────────

-- 공통: updated_at 자동 갱신
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================================
-- 1) 공통 설비 마스터
-- ============================================================================

-- 설비 (예: 1호기 HRSG, 지역난방 열교환기 3호)
create table if not exists equipment (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- 설비 유형: GT / ST / HRSG / DH / 발전기 / 전기설비 / 제어설비 / 펌프·밸브 / 배관 / 비계 / 기타
  -- 오버홀 엑셀 파서가 자동 분류하던 값이 여기로 들어온다.
  type         text,
  -- 분야: 기계 / 전기 / 제어 / 전산
  field        text,
  -- 지사 — 단일 사업장 운영이지만 고장이력이 지사값을 쓰므로 일반 필드로 보존
  branch       text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 설비명은 업로드/등록 시 upsert의 기준이 되므로 대소문자·공백 무시 유일성을 건다.
create unique index if not exists equipment_name_key
  on equipment (lower(btrim(name)));
create index if not exists equipment_name_trgm
  on equipment using gin (name gin_trgm_ops);

drop trigger if exists equipment_set_updated_at on equipment;
create trigger equipment_set_updated_at before update on equipment
  for each row execute function set_updated_at();


-- 기기·태그 (예: PIT-7610) — 챗봇의 태그 정확일치 검색 대상
create table if not exists device (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  tag          text not null,
  -- 정규화 태그: 대문자화 + 하이픈/공백/언더스코어 제거.
  -- "PIT-7610", "pit 7610", "PIT7610" 을 같은 태그로 취급하기 위한 것.
  tag_norm     text generated always as (
                 upper(regexp_replace(tag, '[-_[:space:]]', '', 'g'))
               ) stored,
  name         text,
  spec         text,
  created_at   timestamptz not null default now()
);

create unique index if not exists device_tag_norm_key on device (tag_norm);
create index if not exists device_equipment_idx on device (equipment_id);
create index if not exists device_tag_trgm on device using gin (tag gin_trgm_ops);


-- ============================================================================
-- 2) 오버홀 공정관리
-- ============================================================================

create table if not exists overhaul_project (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  plant        text,
  unit         text,
  start_date   date,   -- 계약 시작일
  end_date     date,   -- 준공 예정일
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists overhaul_project_set_updated_at on overhaul_project;
create trigger overhaul_project_set_updated_at before update on overhaul_project
  for each row execute function set_updated_at();


-- 업로드한 설계내역서 엑셀 1개 = source 1건. 파일 단위 삭제/롤백을 위해 분리한다.
create table if not exists overhaul_source (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references overhaul_project(id) on delete cascade,
  file_name    text not null,
  -- 업로드 시 사용자가 지정한 분야 (자동/기계/전기/제어)
  field_hint   text,
  task_count   integer not null default 0,
  uploaded_at  timestamptz not null default now()
);

create index if not exists overhaul_source_project_idx on overhaul_source (project_id);


create table if not exists overhaul_task (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references overhaul_project(id) on delete cascade,
  source_id     uuid references overhaul_source(id) on delete cascade,
  equipment_id  uuid references equipment(id) on delete set null,

  name          text not null,
  spec          text,
  unit          text,
  plan_qty      numeric(14, 3) not null default 0,
  done_qty      numeric(14, 3) not null default 0,

  field         text,   -- 기계 / 전기 / 제어
  -- 파서가 분류한 설비 유형. equipment_id가 연결되기 전에도 집계할 수 있도록 값 자체를 보관한다.
  equipment_type text,
  tag           text,

  status        text not null default '대기',   -- 대기 / 진행중 / 완료 / 지연
  assignee      text,

  plan_start    date,
  plan_end      date,

  -- 수량·단위·분야가 불명확해 사람이 확인해야 하는 항목 (PRD 6장 "확인 필요" 플래그)
  needs_review  boolean not null default false,

  sheet_name    text,
  row_index     integer,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists overhaul_task_project_idx   on overhaul_task (project_id);
create index if not exists overhaul_task_source_idx    on overhaul_task (source_id);
create index if not exists overhaul_task_equipment_idx on overhaul_task (equipment_id);
create index if not exists overhaul_task_field_idx     on overhaul_task (field);
create index if not exists overhaul_task_name_trgm     on overhaul_task using gin (name gin_trgm_ops);

drop trigger if exists overhaul_task_set_updated_at on overhaul_task;
create trigger overhaul_task_set_updated_at before update on overhaul_task
  for each row execute function set_updated_at();


-- 실적 입력 — 날짜별로 독립 저장하고, 항목별 정비 이력 타임라인으로 되짚어 본다.
create table if not exists overhaul_entry (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references overhaul_task(id) on delete cascade,
  entry_date    date not null,
  done_qty      numeric(14, 3) not null default 0,
  work_detail   text,
  delay_reason  text,
  -- 파일 경로 (.data/uploads/overhaul-photos/…)
  photo_before  text,
  photo_after   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (task_id, entry_date)
);

create index if not exists overhaul_entry_task_idx on overhaul_entry (task_id, entry_date desc);

drop trigger if exists overhaul_entry_set_updated_at on overhaul_entry;
create trigger overhaul_entry_set_updated_at before update on overhaul_entry
  for each row execute function set_updated_at();


-- ============================================================================
-- 3) 고장이력 관리
--    원본(better-sqlite3)의 failure_history 컬럼을 그대로 옮기고 equipment_id만 추가했다.
-- ============================================================================

create table if not exists failure_history (
  id                     bigint generated always as identity primary key,
  equipment_id           uuid references equipment(id) on delete set null,

  title                  text,
  report_type            text default '고장상보',
  branch                 text,
  heat_facility          text,
  equipment_name         text,   -- 마스터 연결 전/실패 시에도 원문을 잃지 않도록 보존
  device_name            text,
  failure_field          text,   -- 기계 / 제어 / 전산 / 전기 / 인적실수 / 기타
  status                 text default '조치중',   -- 조치중 / 조치완료

  occurred_at            text,   -- 원본이 'YYYY-MM-DDTHH:MM' 문자열 비교에 의존하므로 text 유지
  recovered_at           text,

  apt_count              text,
  building_count         text,
  interruption_duration  text,
  interruption_period    text,

  cause_manager_raw      text,
  cause_owner_raw        text,
  situation              text,
  alarm_status           text,
  cause_4m1e             text,
  impact_heat_loss       text,
  impact_duration        text,
  emergency_action       text,
  recovery_detail        text,
  recurrence_prevention  text,
  content_summary        text,

  reporter               text,
  source                 text default 'manual',   -- manual / bulk-upload

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 원본의 `... LIKE '%q%' OR ...` 전 컬럼 검색을 인덱스 하나로 대체한다.
-- Postgres 기본 전문검색(tsvector)은 한국어 형태소 분석기가 없어 조사가 붙은 단어를 못 끊는다.
-- 그래서 trigram 부분일치를 쓴다.
alter table failure_history
  add column if not exists search_text text generated always as (
    coalesce(title, '') || ' ' ||
    coalesce(branch, '') || ' ' ||
    coalesce(heat_facility, '') || ' ' ||
    coalesce(equipment_name, '') || ' ' ||
    coalesce(device_name, '') || ' ' ||
    coalesce(situation, '') || ' ' ||
    coalesce(cause_4m1e, '') || ' ' ||
    coalesce(recovery_detail, '') || ' ' ||
    coalesce(recurrence_prevention, '') || ' ' ||
    coalesce(content_summary, '')
  ) stored;

create index if not exists failure_history_search_trgm
  on failure_history using gin (search_text gin_trgm_ops);
create index if not exists failure_history_equipment_idx on failure_history (equipment_id);
create index if not exists failure_history_branch_idx    on failure_history (branch);
create index if not exists failure_history_status_idx    on failure_history (status);
create index if not exists failure_history_field_idx     on failure_history (failure_field);
create index if not exists failure_history_occurred_idx  on failure_history (occurred_at desc);

drop trigger if exists failure_history_set_updated_at on failure_history;
create trigger failure_history_set_updated_at before update on failure_history
  for each row execute function set_updated_at();


create table if not exists failure_attachment (
  id           bigint generated always as identity primary key,
  failure_id   bigint not null references failure_history(id) on delete cascade,
  file_name    text not null,
  -- 파일 경로 (.data/uploads/failure-attachments/…) — 원본의 stored_name 대체
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create index if not exists failure_attachment_failure_idx on failure_attachment (failure_id);


-- ============================================================================
-- 4) 정비 챗봇
--    ChromaDB 벡터검색 → Postgres 태그 정확일치 + trigram 유사도로 대체.
--    LLM·외부 임베딩 API를 사용하지 않는다.
-- ============================================================================

create table if not exists document (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  -- 파일 경로 (.data/uploads/documents/…)
  storage_path  text not null,
  kind          text not null default '준공도서',   -- 준공도서 / 벤더프린트 / 고장사례
  -- 파일 해시 — 내용이 같으면 재인덱싱을 건너뛴다 (원본의 증분 인덱싱 유지)
  content_hash  text unique,
  page_count    integer,
  chunk_count   integer not null default 0,
  indexed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists document_kind_idx on document (kind);


create table if not exists document_chunk (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references document(id) on delete cascade,
  page_number  integer not null,
  chunk_index  integer not null,
  text         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists document_chunk_document_idx on document_chunk (document_id, page_number);
create index if not exists document_chunk_text_trgm    on document_chunk using gin (text gin_trgm_ops);

-- 나중에 pgvector로 확장할 때는 이 테이블에 embedding 컬럼만 추가하면 되고,
-- 위 검색 경로는 그대로 둔 채 병행 사용할 수 있다. (스키마를 갈아엎지 않는 확장 경로)


-- 문서에서 발견된 태그 ↔ 청크 연결 — "Ctrl+F 방식" 태그 정확일치 검색용
create table if not exists document_tag (
  id           bigint generated always as identity primary key,
  chunk_id     bigint not null references document_chunk(id) on delete cascade,
  tag_norm     text not null,
  created_at   timestamptz not null default now()
);

create index if not exists document_tag_norm_idx  on document_tag (tag_norm);
create index if not exists document_tag_chunk_idx on document_tag (chunk_id);


create table if not exists chat_message (
  id           bigint generated always as identity primary key,
  role         text not null,   -- user / assistant
  content      text not null,
  -- 답변에 인용한 근거 문서 목록 [{documentId, fileName, pageNumber}]
  sources      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists chat_message_created_idx on chat_message (created_at desc);


-- ============================================================================
-- 첨부파일에 대하여
--
-- 파일 자체는 DB에 넣지 않는다. 아래 컬럼들이 파일 위치만 문자열로 들고 있다.
--   failure_attachment.storage_path   고장이력 첨부
--   overhaul_entry.photo_before/after 분해 전·후 사진
--   document.storage_path             준공도서 PDF
--
-- 지금은 프로젝트 안 .data/uploads/ 에 저장한다(로컬 개발). 나중에 파일 저장소를
-- 바꾸더라도 경로 문자열 규칙만 맞추면 되고, 이 스키마는 손대지 않는다.
-- ============================================================================
