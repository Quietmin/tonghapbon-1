-- ============================================================================
-- 문서 자동생성(docgen) 보관함 — 삭제 허용
--
-- 실행 대상: Supabase 프로젝트 **"통합본-1"** (01-docgen-schema.sql 을 실행한 곳)
--            SQL Editor 에 전체를 붙여넣고 실행. 여러 번 실행해도 안전하다.
--
-- ---------------------------------------------------------------------------
-- ⛔ 뚝 DOC 프로젝트(fmgxmkccmpbadmomfhbw)에서는 실행하지 말 것
-- ---------------------------------------------------------------------------
-- 뚝 DOC 은 별개로 운영되는 웹앱이다. 그쪽은 관리자 로그인을 쓰고 자체 삭제 정책
-- (db/storage-delete-admin.sql)이 따로 있다. 이 파일은 통합본-1 전용이다.
--
-- ---------------------------------------------------------------------------
-- ⚠️ 이걸 실행하면 무엇이 달라지는지 (알고 실행할 것)
-- ---------------------------------------------------------------------------
-- 통합앱에는 로그인이 없다. 그래서 이 파일을 실행하면
--
--   anon 키를 아는 누구나 보관함의 어떤 문서든 지울 수 있게 된다.
--
-- 01-docgen-schema.sql 이 삭제를 열지 않았던 이유가 이것이다. 화면의 확인창은
-- 실수를 줄여 줄 뿐, 권한을 대신하지 못한다. 되돌릴 수 없는 작업이므로
-- 사내망 전용이 아니라면 이 점을 감안해야 한다.
--
-- 화면에는 삭제 암호를 묻는 창이 있지만, 그 암호는 브라우저로 내려가는 코드에
-- 들어 있어 누구나 읽을 수 있다. 실수로 누르는 것을 막아 줄 뿐 권한이 아니다.
--
-- 되돌리려면 맨 아래 "다시 잠그기"를 실행한다. 이미 지워진 문서는 돌아오지 않는다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 테이블 행 삭제
-- ---------------------------------------------------------------------------
grant delete on public.docgen_documents to anon, authenticated;

drop policy if exists "docgen_delete_all" on public.docgen_documents;
create policy "docgen_delete_all"
  on public.docgen_documents for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. Storage 의 PDF 파일 삭제
--    행만 지우면 버킷에 PDF 가 그대로 남아 용량을 먹고, 경로를 아는 사람은
--    서명 URL 로 계속 열 수 있다. 둘을 함께 지워야 실제로 지워진 것이다.
--    bucket_id 를 조건에 박아 두어 다른 버킷에는 손이 닿지 않는다.
-- ---------------------------------------------------------------------------
drop policy if exists "docgen_storage_delete" on storage.objects;
create policy "docgen_storage_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'docgen-documents');

-- ============================================================================
-- 확인 — 아래 두 줄이 각각 1건씩 나오면 정상
-- ============================================================================
--   select policyname from pg_policies
--    where tablename = 'docgen_documents' and cmd = 'DELETE';
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname = 'docgen_storage_delete';

-- ============================================================================
-- 다시 잠그기 (삭제를 막는다)
-- ============================================================================
--   revoke delete on public.docgen_documents from anon, authenticated;
--   drop policy if exists "docgen_delete_all"     on public.docgen_documents;
--   drop policy if exists "docgen_storage_delete" on storage.objects;
