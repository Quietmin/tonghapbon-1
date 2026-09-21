// 설비별 중장기 유지보수 관리계획 엑셀 파서
//
// 실제 파일(전기설비 중장기 유지보수 관리계획.xlsx)을 분석해 만든 것이다.
// 시트마다 컬럼이 한 칸씩 밀려 있고(A열이 비어 있거나 아니거나), 전동기 시트는
// 전압·전류·베어링 컬럼이 중간에 끼어 연도 열 위치가 완전히 다르다. 그래서
// 고정 인덱스를 쓰지 않고 헤더 문자열로 컬럼을 찾아낸다.
//
// 파일 구조:
//   0행: 설비구분 | 기 기 명 | 기기번호 | 제작사 | 사양 | 중장기 보수계획(등급) | 예방점검주기 | 정밀점검주기 | 시행방법 | 준공년도
//   1행: (등급 열 아래에) 2021 | 2022 | ... | 2030
//   2행~: 데이터. 중간중간 "1. 발전설비" 같은 대분류 행과 "[2년 주기]" 주석이 섞여 있다
import * as XLSX from "xlsx";

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

/** 주기 문자열 해석 결과 */
export type CycleKind = "fixed" | "ambiguous" | "asneeded" | "none";

export interface ParsedCycle {
  kind: CycleKind;
  /** kind==="fixed"일 때 주기(년) */
  years?: number;
  /** kind==="ambiguous"일 때 후보 주기들 (예: 실내 3년 / 실외 2년 → [3,2]) */
  options?: number[];
  raw: string;
}

export interface ParsedPlanItem {
  category: string | null;      // 대분류 (1. 발전설비 …)
  subCategory: string | null;   // 설비구분 세부 (부속기기 …)
  name: string;                 // 기기명
  tagNo: string | null;         // 기기번호
  maker: string | null;
  spec: string | null;          // 사양 → 수량산출서 Range
  cycleRaw: string | null;      // 정밀점검주기 원문
  cycle: ParsedCycle;
  patrolCycle: string | null;   // 예방점검주기 (참고용)
  method: string | null;        // 시행방법 (O/H, 경상정비 …)
  completion: string | null;    // 준공년도
  /** 엑셀에 적혀 있던 연도별 등급 — X·- 는 제외하고 A/B/C만 */
  grades: { year: number; grade: string }[];
  /** A등급 이력에서 역산한 마지막 보수연도 (없으면 null) */
  lastDoneYear: number | null;
  sheetName: string;
  rowIndex: number;
}

export interface ParsedPlanResult {
  fileName: string;
  sheetCount: number;
  /** 실제로 파싱한 시트 (구조를 못 알아본 시트는 제외) */
  parsedSheets: string[];
  skippedSheets: string[];
  items: ParsedPlanItem[];
  /** 시행방법별 건수 — 화면에서 O/H 외 항목을 참고로 보여주기 위한 집계 */
  byMethod: Record<string, number>;
  /** 주기 해석 종류별 건수 */
  byCycleKind: Record<string, number>;
}

const norm = (v: Cell): string => (v == null ? "" : String(v).trim());
const squash = (v: Cell): string => norm(v).replace(/\s+/g, "");

/** 보수 강도 등급만 남긴다. X(그 해 안 함), -(해당 없음)은 등급이 아니다. */
const GRADES = new Set(["A", "B", "C"]);

/**
 * 정밀점검주기 문자열 해석.
 *   "2년"                          → fixed 2
 *   "5년±6월"                      → fixed 5
 *   "실내: 3년 주기, 실외: 2년 주기" → ambiguous [3,2]  ← 사용자가 판단해야 한다
 *   "154kV 4년 주기(~20년), 22.9kV 4년 주기(~10년)" → fixed 4 (숫자가 같으면 애매하지 않다)
 *   "필요시"                        → asneeded
 *   "-" / ""                       → none
 */
export function parseCycle(raw: Cell): ParsedCycle {
  const t = norm(raw);
  if (!t || t === "-") return { kind: "none", raw: t };
  if (t.includes("필요시")) return { kind: "asneeded", raw: t };

  const nums = [...new Set([...t.matchAll(/(\d+)\s*년/g)].map((m) => Number(m[1])))];
  if (nums.length === 0) return { kind: "none", raw: t };
  if (nums.length === 1) return { kind: "fixed", years: nums[0], raw: t };
  return { kind: "ambiguous", options: nums, raw: t };
}

/** 헤더 후보 문자열로 컬럼 인덱스를 찾는다 (공백 무시, 부분일치) */
function findCol(headerRows: Row[], candidates: string[]): number | null {
  for (const row of headerRows) {
    for (let c = 0; c < row.length; c++) {
      const t = squash(row[c]);
      if (!t) continue;
      if (candidates.some((k) => t === k || t.includes(k))) return c;
    }
  }
  return null;
}

interface SheetLayout {
  yearHeaderRow: number;
  years: { col: number; year: number }[];
  col: {
    category: number | null;
    name: number | null;
    tagNo: number | null;
    maker: number | null;
    spec: number | null;
    patrol: number | null;
    cycle: number | null;
    method: number | null;
    completion: number | null;
  };
}

/**
 * 시트의 레이아웃을 자동으로 알아낸다.
 * 연도(4자리)가 가장 많이 들어있는 행을 연도 헤더로 보고, 그 위 행들에서 컬럼명을 찾는다.
 */
function detectLayout(rows: Row[]): SheetLayout | null {
  let yearHeaderRow = -1;
  let best = 0;
  const scan = Math.min(rows.length, 8);
  for (let i = 0; i < scan; i++) {
    const n = (rows[i] ?? []).filter((c) => /^(19|20)\d{2}$/.test(norm(c))).length;
    // 연도가 최소 3개는 이어져 있어야 중장기 계획표로 본다
    if (n >= 3 && n > best) {
      best = n;
      yearHeaderRow = i;
    }
  }
  if (yearHeaderRow === -1) return null;

  const years: { col: number; year: number }[] = [];
  (rows[yearHeaderRow] ?? []).forEach((c, j) => {
    const t = norm(c);
    if (/^(19|20)\d{2}$/.test(t)) years.push({ col: j, year: Number(t) });
  });

  // 컬럼명은 연도 헤더 행 위쪽(보통 0행)에 있다
  const headerRows = rows.slice(0, yearHeaderRow + 1);
  const col = {
    category: findCol(headerRows, ["설비구분"]),
    name: findCol(headerRows, ["기기명"]),
    tagNo: findCol(headerRows, ["기기번호"]),
    maker: findCol(headerRows, ["제작사"]),
    spec: findCol(headerRows, ["사양"]),
    patrol: findCol(headerRows, ["예방점검주기"]),
    cycle: findCol(headerRows, ["정밀점검주기"]),
    method: findCol(headerRows, ["시행방법"]),
    completion: findCol(headerRows, ["준공년도", "준공연도"]),
  };

  // 기기명을 못 찾으면 어느 게 설비인지 알 수 없다
  if (col.name == null) return null;
  return { yearHeaderRow, years, col };
}

/** "1. 발전설비" 처럼 번호로 시작하는 대분류 행인지 */
function isCategoryRow(v: Cell): boolean {
  return /^\s*\d+\.\s/.test(norm(v));
}

/** "[발전기 정기검사, 2년 주기]" 같은 주석 셀인지 */
function isAnnotation(v: Cell): boolean {
  const t = norm(v);
  return t.startsWith("[") || t.startsWith("※");
}

function analyzeSheet(
  sheetName: string,
  rows: Row[],
  thisYear: number,
): { items: ParsedPlanItem[]; ok: boolean } {
  const layout = detectLayout(rows);
  if (!layout) return { items: [], ok: false };

  const { col, years, yearHeaderRow } = layout;
  const items: ParsedPlanItem[] = [];
  let currentCategory: string | null = null;

  for (let r = yearHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];

    // 대분류 행이면 카테고리만 갱신하고 넘어간다.
    // (대분류는 설비구분 열 또는 그 왼쪽 열에 나타난다 — 시트마다 밀려 있어서 둘 다 본다)
    const catCandidates = [
      col.category != null ? row[col.category] : "",
      col.category != null && col.category > 0 ? row[col.category - 1] : "",
    ];
    const catHit = catCandidates.find((c) => isCategoryRow(c));
    if (catHit) {
      currentCategory = norm(catHit);
      continue;
    }

    const name = norm(col.name != null ? row[col.name] : "");
    if (!name || isCategoryRow(name) || isAnnotation(name)) continue;

    // 연도 열에 아무 값도 없고 주기도 없으면 실제 설비 행이 아니다 (빈 줄·머리글 잔재)
    const gradeCells = years.map((y) => norm(row[y.col]));
    const cycleRaw = col.cycle != null ? norm(row[col.cycle]) : "";
    if (gradeCells.every((v) => !v) && !cycleRaw) continue;

    const grades: { year: number; grade: string }[] = [];
    years.forEach((y, k) => {
      const g = gradeCells[k].toUpperCase();
      if (GRADES.has(g)) grades.push({ year: y.year, grade: g });
    });

    // 마지막 보수연도 = 올해보다 앞선 A·B·C 연도 중 가장 최근.
    //
    // A만 보면 안 된다. A·B·C는 모두 "그 해 보수 실시"이고 강도만 다르기 때문이다
    // (A=분해점검 수준 … C=단순보수). 실제 데이터로 확인한 결과, A만 기준으로 잡으면
    // 1년 주기 설비 7건이 "3년 기한초과"로 잘못 판정됐다 — 엑셀에 A는 몇 년에 한 번만
    // 찍히고 그 사이 해는 C로 채워져 있기 때문이다. A·B·C를 모두 보수 실적으로 세면
    // 그 7건이 정확히 "도래"로 잡히고, 2·3·4·5년 주기 설비의 판정은 전혀 달라지지 않는다.
    const doneYears = grades.map((g) => g.year).filter((y) => y < thisYear);
    const lastDoneYear = doneYears.length ? Math.max(...doneYears) : null;

    items.push({
      category: currentCategory,
      subCategory: col.category != null ? norm(row[col.category]) || null : null,
      name,
      tagNo: col.tagNo != null ? norm(row[col.tagNo]) || null : null,
      maker: col.maker != null ? norm(row[col.maker]) || null : null,
      spec: col.spec != null ? norm(row[col.spec]) || null : null,
      cycleRaw: cycleRaw || null,
      cycle: parseCycle(cycleRaw),
      patrolCycle: col.patrol != null ? norm(row[col.patrol]) || null : null,
      method: col.method != null ? norm(row[col.method]) || null : null,
      completion: col.completion != null ? norm(row[col.completion]) || null : null,
      grades,
      lastDoneYear,
      sheetName,
      rowIndex: r + 1,
    });
  }

  return { items, ok: true };
}

export function parseMaintenancePlan(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  thisYear: number = new Date().getFullYear(),
): ParsedPlanResult {
  const wb = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: "array" });

  const items: ParsedPlanItem[] = [];
  const parsedSheets: string[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    // blankrows:true — 원본 행 번호를 유지해야 연도 헤더 위치가 어긋나지 않는다
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
      header: 1,
      blankrows: true,
      defval: "",
    });
    const res = analyzeSheet(sheetName, rows, thisYear);
    if (res.ok && res.items.length) {
      parsedSheets.push(sheetName);
      items.push(...res.items);
    } else {
      skippedSheets.push(sheetName);
    }
  }

  const byMethod: Record<string, number> = {};
  const byCycleKind: Record<string, number> = {};
  for (const it of items) {
    const m = it.method || "(미지정)";
    byMethod[m] = (byMethod[m] || 0) + 1;
    byCycleKind[it.cycle.kind] = (byCycleKind[it.cycle.kind] || 0) + 1;
  }

  return {
    fileName,
    sheetCount: wb.SheetNames.length,
    parsedSheets,
    skippedSheets,
    items,
    byMethod,
    byCycleKind,
  };
}
