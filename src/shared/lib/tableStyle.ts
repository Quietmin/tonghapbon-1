import type { KeyboardEvent } from "react";

/**
 * 목록 표 공통 모양 — 현황 조회·첫 화면의 현황 목록·고장보고서 조회가 같은 행 높이·머리 색·호버를
 * 쓰도록 한 곳에 둔다. 표마다 따로 적으면 한쪽만 고쳐져 화면마다 표가 달라 보인다.
 */

export const TABLE = "w-full text-sm";

/** 머리 줄 — 흐린 글자색 + 아래 선 */
export const HEAD_ROW = "text-on-surface-variant border-b border-border-subtle";

/** 머리 칸 / 본문 칸의 위아래 여백(행 높이). 좌우 여백은 표마다 열 구성에 맞춰 붙인다 */
export const TH_Y = "py-3 font-bold whitespace-nowrap";
export const TD_Y = "py-3";

/** 본문 행 — 구분선, 마우스를 올리면 배경이 살짝 바뀐다 */
export const BODY_ROW =
  "border-b border-border-subtle last:border-0 text-on-surface hover:bg-surface-container-high/60 transition-colors";

/** 눌러서 창을 여는 행 — 포인터 + 키보드 포커스 표시 */
export const CLICKABLE_ROW =
  `${BODY_ROW} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`;

/**
 * 행(tr)을 키보드로도 누를 수 있게 한다 — Enter·Space 로 마우스 클릭과 같은 일을 한다.
 * tr 에 role="button" 을 주면 표 구조가 깨지므로 tabIndex 와 키 처리만 둔다.
 */
export function rowKeyHandler(activate: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    // 행 안의 버튼·링크가 받은 키는 그쪽이 처리하게 둔다
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
}
