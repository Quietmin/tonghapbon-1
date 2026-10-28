import Link from "next/link";
import { Card, EmptyState, Icon } from "@/shared/components/ui";
import { getCurrentUser } from "@/shared/lib/currentUser";
import {
  OPERATIONS_DEPARTMENT,
  isMaintenanceDepartment,
} from "@/shared/lib/departments";
import { getMaintenanceSummary, getOperationsSummary, type StatusSummary } from "../lib/statusSummary";
import HomeDashboard, { EquipmentSection } from "./HomeDashboard";
import IssueListPanel from "./IssueListPanel";
import StatusCountCards from "./StatusCountCards";

/**
 * PC 처음 화면 — 내 부서에 따라 화면이 갈린다.
 *
 * - 운영부: 현황 등록 바로가기 + 내 지사의 현황 상태별 건수 + 최근 등록한 현황
 * - 유지보수(계전부·기계부·공무부): 같은 구성에 자기 부서 데이터만 — 조치 필요 건수·목록,
 *   추후 조치 예정 일정, 그 아래 설비관리 공정 현황
 * - 부서를 아직 안 골랐으면(팝업이 뜨는 상태) 예전 설비관리 대시보드를 그대로 보여 준다
 *
 * 부서는 getCurrentUser() 로 읽는다 — 지금은 쿠키, 로그인이 붙으면 세션이다.
 */
export default async function HomeByDepartment() {
  const user = await getCurrentUser();

  if (user.department === OPERATIONS_DEPARTMENT) {
    return <OperationsHome branch={user.branch} />;
  }
  if (user.department && isMaintenanceDepartment(user.department)) {
    return <MaintenanceHome branch={user.branch} department={user.department} />;
  }
  return <HomeDashboard />;
}

/** "강남지사 계전부 현황" — 지사·부서만 크게 보이고 부제는 두지 않는다 */
function Header({ title }: { title: string }) {
  return (
    <section className="pt-2">
      <h1 className="text-display-lg text-on-surface">{title}</h1>
    </section>
  );
}

/** 현황을 못 읽었을 때(예: 배포 DB 에 테이블이 아직 없음) 그 영역만 안내한다 */
function StatusError({ summary }: { summary: StatusSummary }) {
  return (
    <Card lift={false} className="p-0">
      <EmptyState
        icon="error"
        title="현황을 불러오지 못했습니다"
        desc={`${summary.error} — 잠시 뒤 새로고침해 보세요. 계속되면 관리자에게 알려 주세요.`}
      />
    </Card>
  );
}

async function OperationsHome({ branch }: { branch: string | null }) {
  const summary = await getOperationsSummary(branch);
  return (
    <div className="space-y-gutter">
      <Header title={`${branch ?? "전체 지사"} ${OPERATIONS_DEPARTMENT} 현황`} />

      {/* 운영 근무자가 가장 자주 하는 일이라 맨 위에 크게 둔다 */}
      <Link
        href="/status/new"
        className="flex items-center gap-4 rounded-xl bg-primary text-on-primary p-6 hover:opacity-95 transition-opacity"
      >
        <span className="w-14 h-14 shrink-0 rounded-2xl bg-white/15 flex items-center justify-center">
          <Icon name="edit_note" className="text-3xl" />
        </span>
        <span className="min-w-0">
          <span className="block text-headline-md">현황 등록</span>
        </span>
        <Icon name="arrow_forward" className="ml-auto text-3xl shrink-0" />
      </Link>

      {summary.error ? (
        <StatusError summary={summary} />
      ) : (
        <>
          <StatusCountCards counts={summary.counts} />
          <IssueListPanel
            title="현황 목록"
            rows={summary.list}
            emptyText="아직 등록된 현황이 없습니다. 위의 현황 등록으로 첫 이슈를 올려 보세요."
            moreLabel="현황 조회"
            table
          />
        </>
      )}
    </div>
  );
}

async function MaintenanceHome({
  branch,
  department,
}: {
  branch: string | null;
  department: string;
}) {
  const summary = await getMaintenanceSummary(branch, department);

  return (
    <div className="space-y-gutter">
      <Header title={`${branch ?? "전체 지사"} ${department} 현황`} />

      {summary.error ? (
        <StatusError summary={summary} />
      ) : (
        <>
          <StatusCountCards counts={summary.counts} />
          <section className="grid gap-gutter lg:grid-cols-3">
            <IssueListPanel
              className="lg:col-span-2"
              title="조치 필요 현황"
              rows={summary.needAction}
              emptyText="조치가 필요한 현황이 없습니다."
              moreLabel="현황 조회"
              editable
            />
            <IssueListPanel
              title="추후 조치 예정 일정"
              rows={summary.scheduled}
              emptyText="예정된 조치가 없습니다."
              moreLabel="현황 조회"
              editable
              showSchedule
            />
          </section>
        </>
      )}

      <section className="space-y-gutter">
        <h2 className="text-headline-md text-on-surface pt-2">설비관리 공정 현황</h2>
        <EquipmentSection />
      </section>
    </div>
  );
}
