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
  /**
   * 데스크톱 사이드바에만 노출하고, 홈 화면 알약 목록(모바일에서도 보임)에는 숨긴다.
   * 사이드바는 md: 이상에서만 렌더링되므로 이 항목은 결과적으로 데스크톱 전용이 된다.
   */
  desktopOnly?: boolean;
  /** 그룹 안에서 시간 흐름상 단계가 나뉠 때 소제목으로 표시 (예: 계약 전/후) */
  section?: string;
}

export interface NavGroup {
  key: "equipment" | "failure" | "manual";
  label: string;
  /**
   * 챕터 색. 사이드바·하단탭·각 화면 제목이 모두 이 값을 읽으므로, 챕터를
   * 어디서 보든 같은 색으로 보인다. 색 규칙 자체는 ui.tsx 의 ACCENT_STYLE 참고.
   */
  accent: "primary" | "tertiary";
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
    // 설비관리 = 기존 "오버홀 공정관리" 챕터 (이름만 바꿈).
    // 설비 마스터를 기준 데이터로 두고, 그 설비들의 오버홀을
    // 계약 전(보수계획 수립) → 계약 후(공정관리) 순서로 관리한다.
    // /overhaul 화면들은 지사별 독립 운영이라 지사 관문(BranchGate)을 지난다.
    key: "equipment",
    label: "설비관리",
    accent: "primary",
    short: "설비",
    icon: "precision_manufacturing",
    root: "/equipment",
    desc: "설비 마스터를 기준으로 오버홀을 관리합니다 — 계약 전 보수계획 수립부터 계약 후 공정·실적 기록까지.",
    items: [
      { href: "/equipment", label: "설비 마스터", icon: "precision_manufacturing", exact: true },
      // ── ① 계약 전: 이번 오버홀에서 무엇을 할지 정하는 단계 ──────────────
      { href: "/overhaul/plan", label: "보수계획", icon: "event_note", section: "계약 전 — 보수계획 수립" },
      // 설비별 연도 축 매트릭스 — "언제 어떤 장비를 점검했는지"를 한 장으로 본다.
      // 회차와 무관하게 설비의 전 이력을 보는 화면이라 계약 전 구역에 둔다.
      { href: "/overhaul/matrix", label: "전체 현황", icon: "table_view", section: "계약 전 — 보수계획 수립" },
      // ── ② 계약 후: 체결 후 실제로 진행·기록하는 단계 ────────────────────
      { href: "/overhaul/project", label: "회차 관리", icon: "engineering", section: "계약 후 — 공정관리" },
      { href: "/overhaul", label: "대시보드", icon: "dashboard", exact: true, section: "계약 후 — 공정관리" },
      { href: "/overhaul/upload", label: "업로드 분석", icon: "analytics", section: "계약 후 — 공정관리" },
      { href: "/overhaul/tasks", label: "작업 관리", icon: "format_list_bulleted", section: "계약 후 — 공정관리" },
      { href: "/overhaul/schedule", label: "공정표", icon: "calendar_view_week", section: "계약 후 — 공정관리" },
      // 분해 전·후 사진은 실적 입력 화면에서 날짜별로 함께 다룬다.
      // 별도 사진 화면은 두지 않는다 (실적과 떨어져 있으면 두 곳을 오가야 한다).
      { href: "/overhaul/entry", label: "실적 입력", icon: "edit_note", section: "계약 후 — 공정관리" },
      { href: "/overhaul/reports", label: "보고서", icon: "summarize", section: "계약 후 — 공정관리" },
    ],
  },
  {
    // 작성/조회 화면은 문서 자동생성(docgen) 모듈의 것을 그대로 쓴다 —
    // 배치만 이 챕터로 옮겼고 서식은 원본 그대로다.
    key: "failure",
    label: "고장관리",
    // 고장 보고서는 사고 기록이라 다른 챕터와 색부터 갈라 둔다
    accent: "tertiary",
    short: "고장",
    icon: "report",
    root: "/failure",
    desc: "지난 고장 보고서를 지사·분야·설비명·고장내용으로 찾아보고, 새 보고서를 작성합니다.",
    // 챕터 첫 화면이 곧 조회다 — 따로 "홈"을 두지 않는다.
    // exact — /failure/new 에서도 조회가 켜져 보이면 어디 있는지 알 수 없다.
    items: [
      { href: "/failure", label: "고장보고서 조회", icon: "inventory_2", exact: true },
      { href: "/failure/new", label: "고장보고서 작성", icon: "edit_note" },
      { href: "/failure/history/new", label: "수기 등록", icon: "note_add", desktopOnly: true },
    ],
  },
  {
    key: "manual",
    label: "매뉴얼관리",
    accent: "primary",
    short: "매뉴얼",
    icon: "menu_book",
    root: "/manual",
    desc: "보관된 매뉴얼을 지사·분야·작성자·파일명으로 찾아보고, 새 매뉴얼을 작성합니다.",
    items: [
      { href: "/manual", label: "매뉴얼 조회", icon: "inventory_2", exact: true },
      { href: "/manual/new", label: "매뉴얼 작성", icon: "edit_note" },
    ],
  },
];

/**
 * 메뉴에서 감췄지만 경로는 살아 있는 화면들.
 * 지우지 않은 이유: 보관함 전체 조회와 고장이력 화면은 나중에 다시 메뉴로 올릴 수
 * 있다. 완전히 접근할 길이 없으면 사실상 삭제와 같으므로, 홈 맨 아래에 작은 링크
 * 줄로만 남겨 둔다. (오버홀 공정관리는 설비관리 챕터의 정식 메뉴가 되어 여기서 뺐다)
 */
export const HIDDEN_ROUTES: NavItem[] = [
  { href: "/docgen/photo-report", label: "사진대장 만들기", icon: "photo_library" },
  { href: "/docgen/archive", label: "보관함 전체 조회", icon: "inventory_2" },
  { href: "/failure/dashboard", label: "고장이력 (미구현)", icon: "history" },
  { href: "/chatbot", label: "정비 챗봇 전체화면", icon: "smart_toy" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
