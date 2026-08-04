// 통합 앱의 메인 메뉴 3개 + 각 하위 메뉴 정의.
// 담당자별 작업 영역이 이 3개 그룹과 그대로 대응한다 (src/modules/{overhaul,failure,chatbot}).

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** 하위 경로까지 활성 처리하지 않고 정확히 일치할 때만 활성화 */
  exact?: boolean;
}

export interface NavGroup {
  key: "overhaul" | "failure" | "chatbot";
  label: string;
  icon: string;
  /** 그룹 대표 경로 (그룹 헤더 클릭 시 이동) */
  root: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overhaul",
    label: "오버홀 공정관리",
    icon: "engineering",
    root: "/overhaul",
    items: [
      // ── ① 보수계획: 이번 오버홀에서 무엇을 할지 정하는 단계 ──────────────
      { href: "/overhaul/plan", label: "보수계획", icon: "event_note" },
      // ── ② 공정관리: 계약 체결 후 실제로 진행·기록하는 단계 ───────────────
      { href: "/overhaul", label: "대시보드", icon: "dashboard", exact: true },
      { href: "/overhaul/upload", label: "업로드 분석", icon: "analytics" },
      { href: "/overhaul/tasks", label: "작업 관리", icon: "format_list_bulleted" },
      { href: "/overhaul/schedule", label: "공정표", icon: "calendar_view_week" },
      { href: "/overhaul/entry", label: "실적 입력", icon: "edit_note" },
      { href: "/overhaul/reports", label: "보고서", icon: "summarize" },
    ],
  },
  {
    key: "failure",
    label: "고장이력 관리",
    icon: "report",
    root: "/failure",
    items: [
      { href: "/failure", label: "대시보드", icon: "monitoring", exact: true },
      { href: "/failure/history", label: "고장이력", icon: "history" },
      { href: "/failure/history/new", label: "신규 등록", icon: "add_circle" },
      { href: "/failure/history/bulk-upload", label: "일괄 업로드", icon: "upload_file" },
    ],
  },
  {
    key: "chatbot",
    label: "정비 챗봇",
    icon: "smart_toy",
    root: "/chatbot",
    items: [
      { href: "/chatbot", label: "검색 챗봇", icon: "chat", exact: true },
      { href: "/chatbot/documents", label: "문서 관리", icon: "folder_open" },
    ],
  },
];

/** 세 모듈이 공통으로 참조하는 설비 마스터 — 그룹에 속하지 않는 공통 메뉴 */
export const SHARED_NAV: NavItem[] = [
  { href: "/equipment", label: "설비 마스터", icon: "precision_manufacturing" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
