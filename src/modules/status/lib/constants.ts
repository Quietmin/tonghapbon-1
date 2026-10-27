/**
 * 현황관리 공통 값 — 서버(repo·API)와 화면이 같은 목록을 쓰도록 여기 한 곳에만 둔다.
 * (서버 전용 import 가 없어 클라이언트 컴포넌트에서도 쓸 수 있다)
 */

/** 조치 상태. 등록 직후는 항상 '미완료'이고, 유지보수 담당자가 나머지로 바꾼다 */
export const STATUS_OPTIONS = ["미완료", "조치중", "추후 조치 예정", "조치완료"] as const;
export type IssueStatus = (typeof STATUS_OPTIONS)[number];

/**
 * 담당부서 목록. 이 배열만 바꾸면 등록 화면·조회 필터가 함께 바뀐다(DB 에는 부서 이름을
 * 그대로 저장하므로 목록을 바꿔도 기존 행은 남는다 — 다만 목록에서 빠진 이름의 행은 조회
 * 화면의 부서 필터로는 걸러 볼 수 없다).
 */
export const DEPARTMENTS = ["운영부", "계전부", "기계부", "공무부"] as const;

/** 상태 칩 색 — 미완료는 눈에 띄게, 조치완료는 차분하게 */
export const STATUS_STYLE: Record<IssueStatus, string> = {
  미완료: "bg-status-error/10 text-status-error",
  조치중: "bg-status-warning/10 text-status-warning",
  "추후 조치 예정": "bg-status-info/10 text-status-info",
  조치완료: "bg-status-success/10 text-status-success",
};

export function isStatus(v: unknown): v is IssueStatus {
  return typeof v === "string" && (STATUS_OPTIONS as readonly string[]).includes(v);
}
