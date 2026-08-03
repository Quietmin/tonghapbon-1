import ModuleStub from "@/shared/components/ModuleStub";

export default function FailureHistoryPage() {
  return (
    <ModuleStub
      title="고장이력"
      from="legacy/고장이력(7.21)/web/src/app/history/page.tsx"
      note="better-sqlite3 쿼리를 Supabase Postgres로 바꾸고, 설비명 자유 텍스트를 설비 마스터 참조로 전환합니다."
    />
  );
}
