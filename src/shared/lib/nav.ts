// 통합 앱의 메인 메뉴 4개 + 각 하위 메뉴 정의.
// 담당자별 작업 영역이 이 4개 그룹과 그대로 대응한다
// (src/modules/{overhaul,failure,chatbot,docgen}).

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * 모바일 하단바용 짧은 이름. 없으면 label 을 쓴다.
   * 하단바는 탭 6개가 한 줄에 들어가야 해서 "오버홀 공정관리" 같은 긴 라벨은 넘친다.
   */
  short?: string;
  /** 하위 경로까지 활성 처리하지 않고 정확히 일치할 때만 활성화 */
  exact?: boolean;
}

export interface NavGroup {
  key: "overhaul" | "failure" | "chatbot" | "docgen";
  label: string;
  /** 모바일 하단바용 짧은 이름 (NavItem.short 와 같은 이유) */
  short?: string;
  icon: string;
  /** 그룹 대표 경로 (그룹 헤더 클릭 시 이동) */
  root: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overhaul",
    label: "오버홀 공정관리",
    short: "오버홀",
    icon: "engineering",
    root: "/overhaul",
    items: [
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
    short: "고장이력",
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
    short: "챗봇",
    icon: "smart_toy",
    root: "/chatbot",
    items: [
      { href: "/chatbot", label: "검색 챗봇", icon: "chat", exact: true },
      { href: "/chatbot/documents", label: "문서 관리", icon: "folder_open" },
    ],
  },
  {
    // 원본: legacy Photo-Report(뚝 DOC — 일잘알 자동 문서 생성기).
    // 이 그룹만 별도 Supabase 프로젝트를 쓴다 (src/modules/docgen/lib/supabase.ts 주석 참고).
    key: "docgen",
    label: "문서 자동생성",
    short: "문서생성",
    icon: "auto_awesome_motion",
    root: "/docgen",
    items: [
      { href: "/docgen", label: "문서 종류 선택", icon: "apps", exact: true },
      { href: "/docgen/photo-report", label: "사진대장 만들기", icon: "photo_library" },
      { href: "/docgen/manual", label: "매뉴얼 만들기", icon: "menu_book" },
      { href: "/docgen/fault-report", label: "고장 보고서 만들기", icon: "warning" },
      { href: "/docgen/archive", label: "보관함 조회", icon: "inventory_2" },
    ],
  },
];

/** 네 모듈이 공통으로 참조하는 설비 마스터 — 그룹에 속하지 않는 공통 메뉴 */
export const SHARED_NAV: NavItem[] = [
  { href: "/equipment", label: "설비 마스터", short: "설비", icon: "precision_manufacturing" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
