import {
  countByStatus,
  listIssues,
  type StatusIssueRow,
} from "@/modules/status/lib/repo";

/**
 * 부서별 첫 화면이 보여 주는 현황 요약.
 *
 * - 운영부: 내 지사의 모든 현황 — 상태별 건수와 목록(현황 조회와 같은 정렬: 조치가 필요한 것부터)
 * - 유지보수(계전부·기계부·공무부): 내 지사 + 내 부서에 배정된 현황 — 조치가 필요한 목록(미완료·
 *   조치중)과 추후 조치 예정 일정
 *
 * 첫 화면은 이 조회가 실패해도 열려야 한다. 배포 DB 에 status_issue 테이블이 아직 없는 동안
 * (npm run db:migrate 전)에도 첫 화면이 통째로 오류가 나면 안 되므로, 실패하면 error 로 돌려
 * 화면이 그 자리만 안내하게 한다.
 */

export interface StatusSummary {
  counts: Record<string, number>;
  /** 조치가 필요한 것(미완료·조치중), 최근 등록순 — 유지보수 화면 */
  needAction: StatusIssueRow[];
  /** 추후 조치 예정, 예정일이 가까운 순 — 유지보수 화면 */
  scheduled: StatusIssueRow[];
  /** 조치가 필요한 것부터 정렬한 전체 부서 목록 — 운영부 화면 */
  list: StatusIssueRow[];
  error?: string;
}

const EMPTY: StatusSummary = { counts: {}, needAction: [], scheduled: [], list: [] };

/** 서버 컴포넌트 → 클라이언트 컴포넌트로 넘길 때 Date 가 섞이지 않게 순수 JSON 으로 바꾼다 */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function getMaintenanceSummary(
  branch: string | null,
  department: string,
): Promise<StatusSummary> {
  try {
    const base = { branch: branch ?? undefined, department };
    const [counts, needAction, scheduled] = await Promise.all([
      countByStatus(base),
      // 화면이 5건씩 끊어 보여 주므로 페이지를 넘길 만큼 넉넉히 가져온다(최대 100건)
      listIssues({ ...base, statuses: ["미완료", "조치중"] }, 100, "recent"),
      listIssues({ ...base, status: "추후 조치 예정" }, 100, "scheduled"),
    ]);
    return plain({ ...EMPTY, counts, needAction, scheduled });
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getOperationsSummary(branch: string | null): Promise<StatusSummary> {
  try {
    const base = { branch: branch ?? undefined };
    const [counts, list] = await Promise.all([
      countByStatus(base),
      // 현황 조회와 같은 정렬 — 미완료 → 조치중 → 추후 조치 예정 → 조치완료, 같은 상태 안에서는 최근 등록순
      listIssues(base, 10, "priority"),
    ]);
    return plain({ ...EMPTY, counts, list });
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) };
  }
}
