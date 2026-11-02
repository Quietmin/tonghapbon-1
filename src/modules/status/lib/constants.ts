/**
 * 현황관리 공통 값 — 서버(repo·API)와 화면이 같은 목록을 쓰도록 여기 한 곳에만 둔다.
 * (서버 전용 import 가 없어 클라이언트 컴포넌트에서도 쓸 수 있다)
 */

/** 조치 상태. 등록 직후는 항상 '미완료'이고, 유지보수 담당자가 나머지로 바꾼다 */
export const STATUS_OPTIONS = ["미완료", "조치중", "추후 조치 예정", "조치완료"] as const;
export type IssueStatus = (typeof STATUS_OPTIONS)[number];

/**
 * 담당부서 목록 — 내 부서(처음 접속 시 선택)와 같은 목록이라 shared/lib/departments.ts 한 곳에 둔다.
 * 바꾸면 등록 화면·조회 필터·내 부서 선택이 함께 바뀐다. DB 에는 부서 이름을 그대로 저장하므로
 * 목록을 바꿔도 기존 행은 남지만, 목록에서 빠진 이름의 행은 부서 필터로 걸러 볼 수 없다.
 */
export { DEPARTMENTS } from "@/shared/lib/departments";

/** 한 이슈에 붙일 수 있는 사진 수 — 화면(브라우저)과 서버가 같은 값을 쓴다 */
export const MAX_ISSUE_PHOTOS = 5;

export function isStatus(v: unknown): v is IssueStatus {
  return typeof v === "string" && (STATUS_OPTIONS as readonly string[]).includes(v);
}
