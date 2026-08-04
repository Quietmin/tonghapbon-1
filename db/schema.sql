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
--   5) 중장기 보수계획     maintenance_plan / maintenance_plan_grade / maintenance_record
--                          design_statement / design_statement_item
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
-- done_qty는 그날의 증가분이 아니라 "그날까지의 누적 완료수량"이다.
-- overhaul_task.done_qty(공정률 계산에 쓰임)는 이 중 최댓값으로 갱신된다.
create table if not exists overhaul_entry (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references overhaul_task(id) on delete cascade,
  entry_date    date not null,
  done_qty      numeric(14, 3) not null default 0,
  work_detail   text,
  delay_reason  text,
  -- 익일 계획 / 조치계획
  next_plan     text,
  -- 개발 단계라 사진은 base64로 그대로 저장한다. 실제 저장소를 붙이면
  -- 파일 경로 문자열(.data/uploads/overhaul-photos/…)로 바뀔 자리다.
  photo_before  text,
  photo_after   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (task_id, entry_date)
);

-- 기존에 만들어진 테이블에도 새 컬럼이 반영되도록 (idempotent)
alter table overhaul_entry add column if not exists next_plan text;

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
-- 5) 중장기 보수계획
--
-- 오버홀은 두 단계로 나뉜다.
--   ① 계획: 설비별 점검주기를 근거로 "올해 무엇을 보수해야 하는지" 판정하고
--           수량산출서를 뽑는다 (이 섹션)
--   ② 실행: 계약 후 설계내역서를 받아 공정을 관리한다 (위 2번 섹션)
--
-- 핵심은 판정을 사람이 매년 엑셀에 손으로 적는 게 아니라, 시스템이
--   다음 보수 예정연도 = 마지막 보수연도 + 정밀점검주기
-- 로 계산한다는 것이다. 그래서 오버홀이 끝나고 maintenance_record에 실적을
-- 남기면 다음 회차 판정이 자동으로 갱신된다.
-- ============================================================================

-- 업로드한 중장기 보수계획 파일 1개 = source 1건 (파일 단위 되돌리기용)
create table if not exists maintenance_plan_source (
  id           uuid primary key default gen_random_uuid(),
  file_name    text not null,
  -- 기계 / 전기 / 제어 — 파일이 담당하는 분야
  field        text,
  sheet_count  integer not null default 0,
  item_count   integer not null default 0,
  uploaded_at  timestamptz not null default now()
);

-- 설비별 보수계획 1행 = 태그넘버로 개별 관리되는 설비 하나 (수량은 항상 1)
create table if not exists maintenance_plan (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references maintenance_plan_source(id) on delete cascade,
  equipment_id  uuid references equipment(id) on delete set null,

  -- 원본 엑셀의 식별 정보
  category      text,          -- 설비구분 대분류 (1. 발전설비, 2. 송수전설비 …)
  sub_category  text,          -- 설비구분 세부 (부속기기 등)
  name          text not null, -- 기기명
  tag_no        text,          -- 기기번호 (Tag No.)
  maker         text,          -- 제작사
  spec          text,          -- 사양 → 수량산출서의 Range로 나간다
  field         text,          -- 기계 / 전기 / 제어

  -- 판정의 근거가 되는 값들
  /** 정밀점검주기 원문 ("2년", "5년±6월", "실내: 3년 주기, 실외: 2년 주기", "필요시") */
  cycle_raw     text,
  /** 파싱된 주기(년). 애매하거나 없으면 null */
  cycle_years   integer,
  /** fixed | ambiguous | asneeded | none — ambiguous면 사용자가 판단해야 한다 */
  cycle_kind    text not null default 'none',
  /** ambiguous일 때 후보 주기들 (예: [3,2]) */
  cycle_options integer[],
  /** 예방점검주기 (주간/월간/분기/연간) — 판정에는 쓰지 않고 참고용 */
  patrol_cycle  text,
  /** 시행방법 (O/H, 경상정비, UPS용역 …). O/H만 수량산출서에 들어간다 */
  method        text,
  completion    text,          -- 준공년도 원문 ("23년 준공")

  /** 최초 업로드 시 엑셀의 A등급 이력에서 역산한 마지막 보수연도 */
  last_done_year integer,

  sheet_name    text,
  row_index     integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists maintenance_plan_source_idx on maintenance_plan (source_id);
create index if not exists maintenance_plan_field_idx  on maintenance_plan (field);
create index if not exists maintenance_plan_method_idx on maintenance_plan (method);
create index if not exists maintenance_plan_equip_idx  on maintenance_plan (equipment_id);
create index if not exists maintenance_plan_name_trgm  on maintenance_plan using gin (name gin_trgm_ops);

drop trigger if exists maintenance_plan_set_updated_at on maintenance_plan;
create trigger maintenance_plan_set_updated_at before update on maintenance_plan
  for each row execute function set_updated_at();


-- 엑셀에 적혀 있던 연도별 등급 (A/B/C/X/-). 판정의 1차 근거가 아니라 참고·이력용.
-- A가 찍힌 연도에서 last_done_year를 역산하고, 화면에서 원본 계획을 함께 보여준다.
create table if not exists maintenance_plan_grade (
  id       bigint generated always as identity primary key,
  plan_id  uuid not null references maintenance_plan(id) on delete cascade,
  year     integer not null,
  /** A(강) / B / C(약) — 보수 강도. X·- 는 저장하지 않는다(그 해 보수 없음) */
  grade    text not null,
  unique (plan_id, year)
);

create index if not exists maintenance_plan_grade_plan_idx on maintenance_plan_grade (plan_id, year);


-- 실제 보수 실적. 오버홀이 끝나면 여기에 남기고, 다음 회차 판정이 자동으로 갱신된다.
-- 이 테이블이 있어야 "매년 엑셀을 손보지 않아도 계속 관리되는" 구조가 성립한다.
create table if not exists maintenance_record (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references maintenance_plan(id) on delete cascade,
  done_year    integer not null,
  /** 실제 수행한 보수 강도 (A/B/C) */
  grade        text,
  /** 이 보수가 어느 오버홀 프로젝트에서 수행됐는지 (있으면 연결) */
  project_id   uuid references overhaul_project(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (plan_id, done_year)
);

create index if not exists maintenance_record_plan_idx on maintenance_record (plan_id, done_year desc);


-- 연도별 설계내역서 (사용자가 확정한 오버홀 대상 목록).
--
-- 이 내역서를 엑셀로 뽑아 시공사에 주면, 시공사가 작업 시작일·종료일을 채워
-- 되돌려준다. 그 파일을 다시 업로드하면 위 2번 섹션(공정관리)의 overhaul_task로
-- 들어가 공정률·공정표 관리가 시작된다. 그래서 한 바퀴가 닫힌다.
--
-- 금액(재료비·노무비·경비)은 다루지 않는다 — 추정가 산정은 시스템 밖의 일이다.
create table if not exists design_statement (
  id           uuid primary key default gen_random_uuid(),
  target_year  integer not null,
  field        text,
  title        text,          -- 공사명 (예: "2026년도 양산지사 정기점검보수공사")
  item_count   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists design_statement_item (
  id           bigint generated always as identity primary key,
  statement_id uuid not null references design_statement(id) on delete cascade,
  plan_id      uuid references maintenance_plan(id) on delete set null,
  /** 대분류 그룹 (Ⅰ. 발전기 및 부속설비 …) — 출력 시 머리글 행이 된다 */
  category     text,
  seq          integer not null,        -- 그룹 내 순번 (1부터)
  name         text not null,           -- 명칭
  spec         text,                    -- 규격
  qty          numeric(14,3) not null default 1,
  unit         text not null default 'EA',
  /** 시공사가 채워 올 칸. 뽑을 때는 비어 있다 */
  plan_start   date,
  plan_end     date,
  grade        text,                    -- 등급(A/B/C) — 명칭에 섞지 않고 별도 컬럼으로 낸다
  note         text,                    -- 비고 (Tag No. 등)
  /** 필수 / 선택 — 확정 당시의 분류를 남긴다 */
  classification text
);

-- 이미 만들어진 테이블에도 grade 컬럼을 더한다 (기존 create table은 새로 만들 때만 적용됨)
alter table design_statement_item add column if not exists grade text;

create index if not exists design_statement_item_stmt_idx on design_statement_item (statement_id, category, seq);


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
