/**
 * 설비 마스터의 유형·분야 값 목록.
 *
 * 지금까지는 db/schema.sql 주석과 excelParser의 자동분류 규칙(EQUIPMENT_RULES,
 * EQUIP_TO_FIELD)에만 흩어져 있던 값이다. 화면의 select 옵션이 파서의 분류값과
 * 갈라지면 같은 설비가 두 줄로 벌어지므로 여기 한 곳에 모은다.
 * 표기는 파서 코드를 따른다 — "펌프/밸브" (슬래시).
 *
 * db.ts를 import하지 않는 이유: 클라이언트 폼 컴포넌트에서도 쓰기 때문.
 */

export const EQUIPMENT_TYPES = [
  "GT",
  "ST",
  "HRSG",
  "DH",
  "발전기",
  "전기설비",
  "제어설비",
  "펌프/밸브",
  "배관",
  "비계",
  "기타",
] as const;

export const EQUIPMENT_FIELDS = ["기계", "전기", "제어", "전산"] as const;

/**
 * 계획 엑셀 대분류를 설비명으로 쓸 때의 정규화 — 머리 번호를 뗀다.
 * "1. 발전설비" → "발전설비", "10) 비상전원설비" → "비상전원설비".
 * "1호기 HRSG"처럼 번호 뒤에 . ) 가 없는 이름은 건드리지 않는다.
 * 설비 마스터에 번호 달린 이름이 쌓이는 걸 막는 유일한 관문이므로,
 * 대분류로 설비를 만들거나 찾는 모든 곳이 이 함수를 거쳐야 한다.
 */
export function normalizeEquipmentName(raw: string): string {
  return raw.replace(/^\s*\d+\s*[.)]\s*/, "").trim();
}
