import SubTabs from "./SubTabs";

/** 중장기보수계획 ↔ 설비별 전체 현황 — 같은 보수계획 데이터의 두 시점이라 한 메뉴로 합쳤다 */
const TABS = [
  { href: "/overhaul/plan", label: "중장기보수계획", icon: "event_note" },
  { href: "/overhaul/plan/matrix", label: "설비별 전체 현황", icon: "table_view" },
] as const;

export default function PlanTabs() {
  return <SubTabs tabs={TABS} ariaLabel="중장기보수계획 하위 화면" />;
}
