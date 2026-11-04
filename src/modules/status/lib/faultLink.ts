import type { StatusIssueRow } from "./repo";

/**
 * 현황 이슈 → 고장보고서 작성 화면으로 넘어가는 주소. 지사·설비명·발생일시와 이슈 내용(→ 고장보고서의 "상황")이
 * 미리 채워지고, 이슈 id 로 그 이슈의 현장 사진까지 "2. 관련 사진"에 들어간 채 열려 같은 내용을 다시 적지 않는다.
 * 받는 쪽은 app/failure/new/page.tsx. (내용은 주소에 실리므로 길이를 자른다)
 */
export const FAULT_LINK_MAX_CONTENT = 600;

export function faultReportHref(
  row: Pick<StatusIssueRow, "id" | "branch" | "equipment_name" | "content" | "created_at">,
): string {
  const sp = new URLSearchParams();
  if (row.branch) sp.set("branch", row.branch);
  sp.set("facility", row.equipment_name);
  sp.set("situation", row.content.slice(0, FAULT_LINK_MAX_CONTENT));
  sp.set("occurred", row.created_at);
  sp.set("issue", row.id);
  return `/failure/new?${sp.toString()}`;
}
