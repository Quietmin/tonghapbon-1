import SubTabs from "./SubTabs";

/** 대시보드 ↔ 보고서 — 같은 공정 집계를 보는 화면/출력물이라 한 메뉴로 합쳤다 */
const TABS = [
  { href: "/overhaul/dashboard", label: "현황", icon: "dashboard" },
  { href: "/overhaul/dashboard/reports", label: "보고서", icon: "summarize" },
] as const;

export default function DashTabs() {
  return <SubTabs tabs={TABS} ariaLabel="대시보드 하위 화면" />;
}
