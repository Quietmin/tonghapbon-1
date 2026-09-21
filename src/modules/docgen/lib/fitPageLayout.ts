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
 * .photo-box/.fr-photo-box 는 각각 flex:1 1 auto 를 이미 갖고 있어(print.css),
 * 여기서 형제 칸(.desc-box/.fr-photo-cap)에 명시적 높이를 주면 자동으로
 * 나머지를 채운다 — 사진 칸 자체를 계산할 필요가 없다.
 */
const PX_PER_MM = 96 / 25.4;
const PAGE_HEIGHT_PX = 297 * PX_PER_MM;
const PAD_BOTTOM_PX = 14 * PX_PER_MM;

interface FitRowOptions {
  gridSelector: string;
  /** 늘어나는 칸(설명 상자) — 칸 자신이 곧 텍스트를 담고 있으면 textSelector 를 null 로 둔다 */
  growSelector: string;
  textSelector: string | null;
  columns: number;
  minGrowPx: number;
  minCompanionPx: number;
}

function fitRows(pageEl: HTMLElement, opts: FitRowOptions): void {
  const grid = pageEl.querySelector<HTMLElement>(opts.gridSelector);
  if (!grid) return;

  const available = PAGE_HEIGHT_PX - grid.offsetTop - PAD_BOTTOM_PX;
  const rowCount = Math.ceil(grid.children.length / opts.columns);
  if (rowCount === 0) return;

  const rowHeight = Math.floor(available / rowCount);
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

    const growHeight = Math.min(needed, rowHeight - opts.minCompanionPx);
    row.forEach((cell) => {
      cell.style.height = `${rowHeight}px`;
      const grow = cell.querySelector<HTMLElement>(opts.growSelector);
      if (grow) grow.style.height = `${growHeight}px`;
    });
  }
}

/** 사진대장·매뉴얼 — .page-grid 의 .photo-set(2열), 늘어나는 건 .desc-box(.desc-text 로 잰다) */
export function fitReportPageLayout(pageEl: HTMLElement | null): void {
  if (!pageEl) return;
  fitRows(pageEl, {
    gridSelector: ".page-grid",
    growSelector: ".desc-box",
    textSelector: ".desc-text",
    columns: 2,
    minGrowPx: 9 * PX_PER_MM,
    minCompanionPx: 45 * PX_PER_MM,
  });
}

/** 고장 보고서 — .fr-photo-grid 의 .fr-photo-cell(3열), 늘어나는 건 .fr-photo-cap 자신 */
export function fitFaultPageLayout(pageEl: HTMLElement | null): void {
  if (!pageEl) return;
  fitRows(pageEl, {
    gridSelector: ".fr-photo-grid",
    growSelector: ".fr-photo-cap",
    textSelector: null,
    columns: 3,
    minGrowPx: 12 * PX_PER_MM,
    minCompanionPx: 40 * PX_PER_MM,
  });
}
