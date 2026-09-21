/**
 * 문서 자동생성 도메인 상수.
 * 원본: legacy Photo-Report(뚝 DOC) index.html 의 선택 목록 정의를 그대로 이식.
 * 값을 바꾸면 이미 보관된 문서의 분류와 어긋나므로 원본과 동일하게 유지한다.
 */

/** 문서 종류 — Supabase documents.doc_type 의 check 제약과 반드시 일치해야 한다 */
export type DocMode = "report" | "manual" | "fault";

export const MODE_LABELS: Record<DocMode, string> = {
  report: "사진대장",
  manual: "매뉴얼",
  fault: "고장 보고서",
};

export const MODE_PLACEHOLDERS: Record<DocMode, string> = {
  report: "예: 사진대장",
  manual: "예: 현장 매뉴얼",
  fault: "예: 고장 보고서",
};

export const BRANCHES = [
  "중앙지사", "강남지사", "파주지사", "삼송지사", "고양사업소", "화성지사",
  "동탄지사", "판교지사", "광교지사", "용인지사", "분당사업소", "평택지사",
  "광주전남지사", "양산지사", "대구지사", "세종지사", "김해사업소", "청주지사",
];

export const MANUAL_TYPES = [
  "업무 매뉴얼", "조작 매뉴얼", "운전 매뉴얼", "점검 매뉴얼", "정비 매뉴얼",
];

export const MANUAL_FIELDS = [
  "전기", "기계", "제어", "전산", "운영", "건축", "토목", "화공", "사무", "기타",
];

export const FAULT_FIELDS = [
  "전기", "기계", "제어", "전산", "운영", "열수송", "기타",
];

/**
 * '기타'는 가나다순으로 두면 중간에 끼는데(기계 → 기타 → 열수송), 목록 맨 아래가
 * 자연스러우므로 정렬에서 빼고 마지막에 붙인다. (원본 주석 유지)
 */
const LAST_OPTIONS = ["기타"];

export function sortKorean(values: string[]): string[] {
  const head = values.filter((v) => !LAST_OPTIONS.includes(v));
  const tail = values.filter((v) => LAST_OPTIONS.includes(v));
  head.sort((a, b) => a.localeCompare(b, "ko"));
  return head.concat(tail);
}

/**
 * 지사는 대부분 양산지사에서 작성하므로 기본값으로 넣어 둔다.
 * 분야는 초기값을 두지 않는다 — 기본값이 들어가 있으면 고르지 않고 지나쳐도
 * 그 값이 그대로 문서에 찍혀, 틀린 분야가 조용히 출력된다. (원본 주석 유지)
 */
export const DEFAULT_BRANCH = "양산지사";

/** 사진 최대 장수 — 원본과 동일 */
export const MAX_PHOTOS = 30;

/** A4 세로 한 페이지에 사진 4장(2×2) — 원본과 동일 */
export const PHOTOS_PER_PAGE = 4;

/**
 * 고장 보고서는 격자가 3열이고 첫 장 위쪽을 고장 요약 표가 차지한다.
 * 그래서 첫 장은 한 줄(3장), 이어지는 장은 세 줄(9장)이다. (원본과 동일)
 */
export const FAULT_PHOTOS_FIRST_PAGE = 3;
export const FAULT_PHOTOS_PER_PAGE = 9;

/** 받침 유무에 따라 조사를 고른다. '사진대장을' / '고장 보고서를' (원본 로직 유지) */
export function withParticle(word: string, afterFinal: string, afterVowel: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return afterFinal;
  return (code - 0xac00) % 28 === 0 ? afterVowel : afterFinal;
}
