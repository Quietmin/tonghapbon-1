import ModuleStub from "@/shared/components/ModuleStub";

/**
 * 고장이력 대시보드 (미구현).
 * 원래 /failure 였으나, /failure 가 고장관리 챕터 첫 화면이 되면서 이리로 옮겼다.
 * 메뉴에는 넣지 않고 경로만 남긴다 — 고장관리 챕터는 고장보고서 작성·조회만 다룬다.
 */
export default function FailureDashboardPage() {
  return <ModuleStub title="고장이력 대시보드" from="legacy/고장이력(7.21)/web/src/app/page.tsx" />;
}
