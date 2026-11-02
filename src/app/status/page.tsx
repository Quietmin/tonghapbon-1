import { ButtonLink, Icon, ScreenHeader } from "@/shared/components/ui";
import { getCurrentUser } from "@/shared/lib/currentUser";
import { isMaintenanceDepartment } from "@/shared/lib/departments";
import StatusBoard from "@/modules/status/components/StatusBoard";

export const metadata = { title: "현황 조회 — 유지보수 마스터" };

/**
 * 현황관리 챕터 첫 화면 = 현황 조회.
 * 운영 근무자가 등록한 설비 이슈 목록이 뜨고, 유지보수 담당자가 행을 눌러 조치 상태
 * (미완료·조치중·추후 조치 예정·조치완료)를 갱신한다. 챕터 첫 화면이 곧 조회인 구조는
 * 매뉴얼관리·고장관리와 같다 — 등록으로는 제목 줄의 버튼(PC)이나 모바일 챕터 서브내비의
 * 탭으로 간다.
 *
 * 처음에는 내 지사로 걸러서 보여 주고, 유지보수 부서(계전부·기계부·공무부)는 자기 담당부서 이슈만 먼저
 * 보인다. 운영부는 담당부서로 거르지 않는다 — 담당부서는 "누가 조치하느냐"라서 운영부가 올린 이슈는
 * 거의 유지보수 부서 담당이고, 운영부로 걸러 두면 자기 지사의 이슈 대부분이 안 보인다. 운영부 계정은
 * 내 지사의 모든 이슈가 뜬다.
 */
export default async function StatusPage() {
  const user = await getCurrentUser();
  return (
    <>
      <ScreenHeader
        icon="monitoring"
        title="현황 조회"
        desc="운영 근무자가 올린 설비 이슈를 확인하고, 유지보수 담당자가 조치 상태를 갱신합니다."
        // 모바일은 타이틀만 — 빈 배열이면 ScreenHeader가 desc·bullets 모두 생략한다
        bullets={[]}
        accent="primary"
        // 연한 칩 = 조회. 등록 화면은 같은 색 꽉 찬 칩이라 둘이 바로 갈린다
        tone="soft"
        action={
          <ButtonLink href="/status/new" variant="primary">
            <Icon name="edit_note" className="text-lg" />
            현황 등록
          </ButtonLink>
        }
      />
      <StatusBoard
        initialBranch={user.branch ?? ""}
        initialDepartment={isMaintenanceDepartment(user.department) ? (user.department ?? "") : ""}
      />
    </>
  );
}
