import SubTabs from "./SubTabs";

/**
 * 작업·공정 — 엑셀 등록(업로드 분석) → 작업 목록 → 공정표.
 * 셋 다 같은 작업항목을 다루는 단계라 한 메뉴로 합쳤다.
 */
const TABS = [
  { href: "/overhaul/tasks/upload", label: "엑셀 등록", icon: "analytics" },
  { href: "/overhaul/tasks", label: "작업 목록", icon: "format_list_bulleted" },
  { href: "/overhaul/tasks/schedule", label: "공정표", icon: "calendar_view_week" },
] as const;

export default function WorkTabs() {
  return <SubTabs tabs={TABS} ariaLabel="작업·공정 하위 화면" />;
}
