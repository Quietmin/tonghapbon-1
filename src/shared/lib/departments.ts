/**
 * 부서 목록 — 지사(branches.ts)와 함께 "내 정보"(지사·부서)를 이루는 값이다.
 *
 * 현황관리의 담당부서 선택지이자, 처음 접속할 때 고르는 내 부서의 선택지다. 업무망에서
 * 실제 로그인이 붙으면 이 목록은 조직 정보에서 오겠지만, 그때까지는 여기 한 곳이 기준이다.
 * (DB 에는 부서 이름을 그대로 저장하므로 목록을 바꿔도 기존 행은 남는다)
 */
export const DEPARTMENTS = ["운영부", "계전부", "기계부", "공무부"] as const;

export type Department = (typeof DEPARTMENTS)[number];

/**
 * 첫 화면을 가르는 큰 구분 — 운영부(이슈를 올리는 쪽)와 유지보수(조치하는 쪽).
 * 유지보수 세 부서는 같은 화면 구성에 각자 부서 데이터만 다르게 보인다.
 */
export const OPERATIONS_DEPARTMENT: Department = "운영부";
export const MAINTENANCE_DEPARTMENTS: readonly Department[] = ["계전부", "기계부", "공무부"];

export function isMaintenanceDepartment(v: unknown): boolean {
  return typeof v === "string" && (MAINTENANCE_DEPARTMENTS as readonly string[]).includes(v);
}

export function isDepartment(v: unknown): v is Department {
  return typeof v === "string" && (DEPARTMENTS as readonly string[]).includes(v);
}
