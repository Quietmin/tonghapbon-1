"use client";

/**
 * 설명이 아무리 길어져도 A4 페이지(297mm)를 넘지 않도록, 남는 높이를 설명 칸에
 * 주고 모자란 만큼은 사진 칸에서 가져온다. 원본(legacy Photo-Report)
 * fitPageLayout() 을 그대로 이식했다 — 고장 보고서(3열)는 원본에 없던 기능이라
 * 같은 방식으로 새로 만들었다.
 *
 * 매 렌더 후 실제 DOM 을 측정해서(scrollHeight) 필요한 높이만 설명 칸에 주고,
 * 그래도 모자라면(설명이 너무 길면) 사진 칸을 최소 크기까지만 줄이고 설명 칸은
 * 넘치는 부분을 자른다(print.css 의 overflow:hidden) — 페이지가 늘어나
 * "규격 아닌 A4"가 되는 것보다는 설명 일부가 가려지는 쪽이 낫다.
 *
 * 사진대장·매뉴얼의 .photo-box 는 flex:1 1 auto 라(print.css), 형제 칸(.desc-box)에
 * 명시적 높이를 주면 사진 칸이 알아서 나머지를 채운다 — 계산할 필요가 없다.
 *
 * 고장 보고서의 .fr-photo-box 는 다르다. height:62mm 고정이고 flex 로 늘어나지
 * 않아서, 칸을 줄 높이로 늘리면 그 여백을 아무도 흡수하지 못해 테두리 안에 빈
 * 공간이 남는다. 그래서 고장 보고서는 칸을 늘리지 않고(stretchCells:false)
 * 내용 높이 그대로 두고, 캡션 높이만 맞춘다.
 */
import {
  FAULT_PHOTOS_FIRST_PAGE,
  FAULT_PHOTOS_PER_PAGE,
  PHOTOS_PER_PAGE,
} from "./constants";

const PX_PER_MM = 96 / 25.4;
const PAGE_HEIGHT_PX = 297 * PX_PER_MM;
const PAD_BOTTOM_PX = 14 * PX_PER_MM;

interface FitRowOptions {
  gridSelector: string;
  /** 늘어나는 칸(설명 상자) — 칸 자신이 곧 텍스트를 담고 있으면 textSelector 를 null 로 둔다 */
  growSelector: string;
  textSelector: string | null;
  columns: number;
  /**
   * 이 서식이 한 장에 담도록 설계된 줄 수. 페이지 높이를 이 수로 나눠 한 줄의 몫을
   * 정한다.
   *
   * 실제로 올라온 칸 수로 나누면 안 된다 — 사진이 한 장뿐인 장에서는 줄이 하나라
   * 그 칸이 남은 페이지 전체를 차지하고, 가운데 정렬된 사진이 페이지 한가운데로
   * 내려가 제목 아래가 텅 비게 된다. 한 장은 늘 같은 격자여야 하므로, 칸이 몇 개
   * 들어왔든 한 줄의 몫은 같다. (원본도 available/2 로 고정이다)
   */
  rows: number;
  minGrowPx: number;
  minCompanionPx: number;
  /**
   * 칸 높이를 줄 높이로 늘릴지. 기본 true.
   * false 면 칸을 내용 높이 그대로 두고 늘어나는 칸의 높이만 맞춘다 —
   * 같은 줄의 늘어나는 칸은 모두 같은 높이로 주므로 칸끼리 높이가 어긋나지 않는다.
   */
  stretchCells?: boolean;
}

function fitRows(pageEl: HTMLElement, opts: FitRowOptions): void {
  const grid = pageEl.querySelector<HTMLElement>(opts.gridSelector);
  if (!grid) return;

  const available = PAGE_HEIGHT_PX - grid.offsetTop - PAD_BOTTOM_PX;
  if (opts.rows <= 0) return;

  const rowHeight = Math.floor(available / opts.rows);
  if (rowHeight <= opts.minCompanionPx + opts.minGrowPx) return;

  const cells = Array.from(grid.children) as HTMLElement[];
  for (let i = 0; i < cells.length; i += opts.columns) {
    const row = cells.slice(i, i + opts.columns);
    let needed = opts.minGrowPx;

    row.forEach((cell) => {
      const grow = cell.querySelector<HTMLElement>(opts.growSelector);
      if (!grow) return;
      const textEl = opts.textSelector ? cell.querySelector<HTMLElement>(opts.textSelector) : grow;
      if (!textEl) return;

      // 다시 재려면 먼저 auto 로 풀어야 한다 — 이전에 강제로 준 높이가 남아 있으면
      // scrollHeight 가 "필요한 만큼"이 아니라 "이전에 준 만큼"으로 읽힌다.
      grow.style.height = "auto";
      const pad =
        textEl === grow
          ? 0
          : parseFloat(window.getComputedStyle(grow).paddingTop) +
            parseFloat(window.getComputedStyle(grow).paddingBottom);
      needed = Math.max(needed, textEl.scrollHeight + pad);
    });

    // 늘리지 않더라도 상한은 둔다 — 설명이 길면 페이지를 넘겨 버리기 때문이다
    const growHeight = Math.min(needed, rowHeight - opts.minCompanionPx);
    row.forEach((cell) => {
      // 이전 렌더에서 준 높이가 남아 있을 수 있으므로 빈 문자열로 확실히 지운다
      cell.style.height = opts.stretchCells === false ? "" : `${rowHeight}px`;
      const grow = cell.querySelector<HTMLElement>(opts.growSelector);
      if (grow) grow.style.height = `${growHeight}px`;
    });
  }
}

/**
 * 사진대장·매뉴얼 — .page-grid 의 .photo-set(2열 2줄),
 * 늘어나는 건 .desc-box(.desc-text 로 잰다).
 * 한 장에 4장(2×2)이 들어가는 서식이므로 줄 수는 늘 2다.
 */
export function fitReportPageLayout(pageEl: HTMLElement | null): void {
  if (!pageEl) return;
  fitRows(pageEl, {
    gridSelector: ".page-grid",
    growSelector: ".desc-box",
    textSelector: ".desc-text",
    columns: 2,
    rows: PHOTOS_PER_PAGE / 2,
    minGrowPx: 9 * PX_PER_MM,
    minCompanionPx: 45 * PX_PER_MM,
  });
}

/**
 * 캡션 칸의 바닥값 = 글 한 줄 (print.css 의 .fr-photo-cap 과 같은 값).
 * font-size 10px × line-height 1.4 = 14px, 위아래 패딩 1.5mm씩 = 3mm.
 * 두 곳이 어긋나면 CSS 가 잡아 둔 높이를 JS 가 덮어써 칸이 들쭉날쭉해진다.
 */
const FAULT_CAP_MIN_PX = 10 * 1.4 + 3 * PX_PER_MM;

/**
 * 고장 보고서 — .fr-photo-grid 의 .fr-photo-cell(3열), 늘어나는 건 .fr-photo-cap 자신.
 * 첫 장은 위를 고장 요약 표가 차지해 한 줄(3장)만, 이어지는 장은 세 줄(9장)이다.
 */
export function fitFaultPageLayout(pageEl: HTMLElement | null, pageIndex = 0): void {
  if (!pageEl) return;
  const capacity = pageIndex === 0 ? FAULT_PHOTOS_FIRST_PAGE : FAULT_PHOTOS_PER_PAGE;
  fitRows(pageEl, {
    gridSelector: ".fr-photo-grid",
    growSelector: ".fr-photo-cap",
    textSelector: null,
    columns: 3,
    rows: capacity / 3,
    minGrowPx: FAULT_CAP_MIN_PX,
    minCompanionPx: 40 * PX_PER_MM,
    // .fr-photo-box 가 62mm 고정이라 칸을 늘리면 빈 공간만 생긴다 (위 주석 참고)
    stretchCells: false,
  });
}
