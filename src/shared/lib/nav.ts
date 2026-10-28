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
  key: "equipment" | "failure" | "manual" | "status";
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
    // 지사별 독립 운영 — /overhaul은 지사 관문(BranchGate)을 지나고,
    // /equipment는 전 지사 개요에서 지사를 고른다 (같은 oh_branch 쿠키를 공유).
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
      { href: "/overhaul/plan", label: "오버홀 수량산출", icon: "event_note", section: "계약 전 — 보수계획 수립" },
      // 전체 현황(연도 축 매트릭스)은 중장기보수계획 화면의 하위 탭으로 합쳤다
      // (/overhaul/plan/matrix) — 같은 계획 데이터를 보는 두 시점이라서.
      // ── ② 계약 후: 체결 후 실제로 진행·기록하는 단계 ────────────────────
      // 회차 관리는 사이드바에서 뺐다 — 모든 공정관리 화면 상단 회차 띠에
      // 같은 링크가 있어 중복이고, 설정 성격이라 자주 들어가지 않는다.
      { href: "/overhaul/dashboard", label: "대시보드", icon: "dashboard", section: "계약 후 — 공정관리" },
      // 업로드 분석·공정표는 작업·공정의 하위 탭으로 합쳤다
      // (/overhaul/tasks/upload, /overhaul/tasks/schedule) — 셋 다 같은 작업항목이라서.
      { href: "/overhaul/tasks", label: "작업·공정", icon: "format_list_bulleted", section: "계약 후 — 공정관리" },
      // 분해 전·후 사진은 실적 입력 화면에서 날짜별로 함께 다룬다.
      // 별도 사진 화면은 두지 않는다 (실적과 떨어져 있으면 두 곳을 오가야 한다).
      { href: "/overhaul/entry", label: "실적 입력", icon: "edit_note", section: "계약 후 — 공정관리" },
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
  {
    // 작성/조회 화면은 문서 자동생성(docgen) 모듈의 것을 그대로 쓴다 —
    // 배치만 이 챕터로 옮겼고 서식은 원본 그대로다.
    key: "failure",
    label: "고장관리",
    // 메뉴(사이드바·하단 탭·서브 탭)에서는 다른 챕터와 같은 남색으로 보이게 한다. 예전에는 사고
    // 기록이라 주황으로 갈랐지만 이 탭만 선택했을 때 튀어 보인다는 의견에 따라 맞췄다.
    // (화면 본문의 고장보고서 조회·작성 화면은 아직 주황 강조색을 그대로 쓴다)
    accent: "primary",
    short: "고장",
    icon: "report",
    root: "/failure",
    desc: "지난 고장 보고서를 지사·분야·설비명·고장내용으로 찾아보고, 새 보고서를 등록합니다.",
    // 챕터 첫 화면이 곧 조회다 — 따로 "홈"을 두지 않는다.
    // exact — /failure/new 에서도 조회가 켜져 보이면 어디 있는지 알 수 없다.
    items: [
      { href: "/failure", label: "고장보고서 조회", icon: "inventory_2", exact: true },
      { href: "/failure/new", label: "고장보고서 등록", icon: "edit_note" },
    ],
  },
  {
    // 네 번째 챕터 — 현황을 조회하고 등록한다. 화면 내용은 아직 정해지는 중이라 지금은 뼈대만 있다
    // (/status, /status/new). 챕터 첫 화면이 곧 조회다 — 매뉴얼관리·고장관리와 같은 구조.
    key: "status",
    label: "현황관리",
    accent: "primary",
    short: "현황",
    icon: "assessment",
    root: "/status",
    desc: "현황을 조회하고, 새 현황을 등록합니다.",
    items: [
      { href: "/status", label: "현황 조회", icon: "monitoring", exact: true },
      { href: "/status/new", label: "현황 등록", icon: "edit_note" },
    ],
  },
];

/**
 * 메뉴에서 감췄지만 경로는 살아 있는 화면들.
 * 보관함 전체 조회는 사진대장(/docgen/photo-report)으로 가는 유일한 입구라 홈 맨 아래
 * 작은 링크 줄로 남겨 둔다 — 나중에 정식 위치가 정해지면 옮긴다.
 * (고장이력 대시보드 /failure/dashboard 와 정비 챗봇 전체화면 /chatbot 은 아직 빈 화면이라
 * 링크를 뺐다. 경로는 살아 있으니 화면이 완성되면 해당 챕터 메뉴에 정식으로 올린다.
 * 오버홀 공정관리는 설비관리 챕터의 정식 메뉴가 되어 여기서 뺐다)
 */
export const HIDDEN_ROUTES: NavItem[] = [
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * 지금 보고 있는 화면이 속한 챕터 — 대표 경로(root) 밖의 하위 메뉴까지 본다
 * (예: 설비관리 챕터의 /overhaul/* 화면들). 사이드바(Sidebar.tsx)와 모바일
 * 챕터 서브내비(ChapterSubNav.tsx)가 같은 판정을 쓰도록 여기 하나로 둔다.
 */
export function activeGroup(pathname: string): NavGroup | null {
  return (
    NAV_GROUPS.find(
      (group) =>
        pathname === group.root ||
        pathname.startsWith(`${group.root}/`) ||
        group.items.some((it) => isActive(pathname, it)),
    ) ?? null
  );
}
