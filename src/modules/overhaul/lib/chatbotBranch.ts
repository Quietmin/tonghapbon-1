// 질문 속 지사 이름을 찾아 챗봇 조회 범위를 정한다 — 서버 전용이 아니어도 되는 순수 함수.
//
// 챗봇 도구(chatbotTools.ts)는 기본적으로 "내 지사"(oh_branch 쿠키) 범위만 조회한다. 그런데 사용자가
// "청주지사 최근 현황 알려줘"처럼 다른 지사를 직접 말해도 내 지사(예: 양산지사) 데이터로 답해 버렸다.
// 질문에 지사 이름이 분명히 들어 있으면 그 지사를, "전 지사"라고 하면 전체를 조회 범위로 쓴다.
import { BRANCHES } from "@/shared/lib/branches";

/** "청주지사" → "청주", "고양사업소" → "고양" — 사람이 말할 때 줄여 부르는 이름 */
const baseName = (b: string) => b.replace(/(지사|사업소)$/, "");

const ALL_RE = /(전\s?지사|전체\s?지사|모든\s?지사|전사)/;

/**
 * - "ALL": 전 지사를 말함(조회 범위 해제)
 * - 지사 이름: 질문에 정확히 한 지사만 나옴 → 그 지사
 * - null: 지사 언급이 없음 → 호출자가 기본(내 지사)을 쓴다
 * - 둘 이상 나오면("청주랑 양산 비교") 한 지사로 좁히지 않고 전체("ALL")로 본다
 */
export function detectBranchInMessage(message: string): string | "ALL" | null {
  if (ALL_RE.test(message)) return "ALL";

  const found = new Set<string>();
  for (const b of BRANCHES) {
    // 전체 이름("청주지사")이나 줄임말("청주")이 들어 있으면 그 지사. "광주전남"은 "광주"로도 불린다
    const names = [b, baseName(b)];
    if (b === "광주전남지사") names.push("광주");
    if (names.some((n) => n && message.includes(n))) found.add(b);
  }
  if (found.size === 0) return null;
  return found.size === 1 ? [...found][0] : "ALL";
}
