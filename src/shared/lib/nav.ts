// 통합 앱의 메인 메뉴 3개 + 각 하위 메뉴 정의.
//
// 화면 구조를 여기 데이터 한 곳에만 적어 둔다. 사이드바(데스크톱)·하단탭(모바일)·
// 헤더·홈 카드가 모두 이 배열을 읽으므로, 앱(PWA/네이티브) 탭바를 붙일 때도
// 같은 정의를 그대로 쓰면 웹과 앱의 메뉴가 갈라지지 않는다.
//
// 챗봇은 여기 없다 — 메뉴가 아니라 모든 화면에 떠 있는 도크다
// (src/shared/components/ChatbotDock.tsx).

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * 모바일 하단바용 짧은 이름. 없으면 label 을 쓴다.
   * 하단바는 탭이 한 줄에 들어가야 해서 "매뉴얼관리" 같은 라벨은 넘칠 수 있다.
   */
  short?: string;
  /** 하위 경로까지 활성 처리하지 않고 정확히 일치할 때만 활성화 */
  exact?: boolean;
}

export interface NavGroup {
  key: "equipment" | "failure" | "manual";
  label: string;
  /** 모바일 하단바용 짧은 이름 (NavItem.short 와 같은 이유) */
  short?: string;
  icon: string;
  /** 그룹 대표 경로 (그룹 헤더 클릭 시 이동하는 챕터 첫 화면) */
  root: string;
  /** 홈 카드에 쓰는 한 줄 설명 */
  desc: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "equipment",
    label: "설비관리",
    short: "설비",
    icon: "precision_manufacturing",
    root: "/equipment",
    desc: "설비 → 기기·태그 2단 마스터. 고장관리·매뉴얼관리가 공통으로 참조하는 기준 데이터입니다.",
    items: [{ href: "/equipment", label: "설비 마스터", icon: "precision_manufacturing", exact: true }],
  },
  {
    // 작성/조회 화면은 문서 자동생성(docgen) 모듈의 것을 그대로 쓴다 —
    // 배치만 이 챕터로 옮겼고 서식은 원본 그대로다.
    key: "failure",
    label: "고장관리",
    short: "고장",
    icon: "report",
    root: "/failure",
    desc: "고장 보고서를 작성하고, 보관된 지난 보고서를 지사·연도·키워드로 찾아봅니다.",
    items: [
      { href: "/failure", label: "고장관리 홈", icon: "dashboard", exact: true },
      { href: "/failure/new", label: "고장보고서 작성", icon: "edit_note" },
      { href: "/failure/archive", label: "고장보고서 조회", icon: "inventory_2" },
      { href: "/failure/history/new", label: "수기 등록", icon: "note_add" },
    ],
  },
  {
    key: "manual",
    label: "매뉴얼관리",
    short: "매뉴얼",
    icon: "menu_book",
    root: "/manual",
    desc: "현장 매뉴얼을 작성하고, 보관된 매뉴얼을 지사·연도·키워드로 찾아봅니다.",
    items: [
      { href: "/manual", label: "매뉴얼관리 홈", icon: "dashboard", exact: true },
      { href: "/manual/new", label: "매뉴얼 작성", icon: "edit_note" },
      { href: "/manual/archive", label: "매뉴얼 조회", icon: "inventory_2" },
    ],
  },
];

/**
 * 메뉴에서 감췄지만 경로는 살아 있는 화면들.
 * 지우지 않은 이유: 오버홀 공정관리는 이미 동작하는 6개 화면이 있고, 보관함 전체
 * 조회와 고장이력 화면도 나중에 다시 메뉴로 올릴 수 있다. 완전히 접근할 길이
 * 없으면 사실상 삭제와 같으므로, 홈 맨 아래에 작은 링크 줄로만 남겨 둔다.
 */
export const HIDDEN_ROUTES: NavItem[] = [
  { href: "/overhaul", label: "오버홀 공정관리", icon: "engineering" },
  { href: "/docgen/photo-report", label: "사진대장 만들기", icon: "photo_library" },
  { href: "/docgen/archive", label: "보관함 전체 조회", icon: "inventory_2" },
  { href: "/failure/dashboard", label: "고장이력 (미구현)", icon: "history" },
  { href: "/chatbot", label: "정비 챗봇 전체화면", icon: "smart_toy" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
