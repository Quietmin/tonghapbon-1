// 전체 설비 장기 보수 현황 엑셀 출력
//
// MaintenanceMatrix 화면에 보이는 표를 그대로 엑셀로 뽑는다. 설비 정보(관리계획
// 엑셀과 같은 컬럼) 뒤에 연도 열을 쭉 붙인 형태 — 원본 중장기 관리계획 엑셀과
// 같은 감각으로 열어볼 수 있게 한다.
//
// 셀 표기 (색을 못 쓰는 커뮤니티 xlsx라 문자로 구분한다):
//   A        — 실적으로 확인된 보수
//   X        — 확인 후 보수하지 않음 (계약변경 등)
//   (A)      — 관리계획 엑셀상 계획이었으나 실적 미확인
//   A*       — 실적·계획 모두 없지만, 반복 패턴이 확인돼 추정한 등급
//   ?        — 반복 패턴이 불확실해 추정할 수 없음 (확인 필요)
import * as XLSX from "xlsx";

export interface MatrixExportCell {
  year: number;
  planned: string | null;
  done: string | null;
  hasRecord: boolean;
  skipped: boolean;
  projected: boolean;
  estimatedGrade: string | null;
}

export interface MatrixExportRow {
  category: string | null;
  sub_category: string | null;
  name: string;
  tag_no: string | null;
  maker: string | null;
  spec: string | null;
  field: string | null;
  method: string | null;
  cycle_raw: string | null;
  isActive: boolean;
  lastDoneYear: number | null;
  judge: {
    classification: "필수" | "선택" | "불필요";
    nextDueYear: number | null;
    needsDecision: boolean;
  };
  cells: MatrixExportCell[];
}

function cellText(c: MatrixExportCell): string {
  if (c.hasRecord && c.skipped) return "X";
  if (c.hasRecord) return c.done ?? "✓";
  if (c.planned) return `(${c.planned})`;
  if (c.projected) return c.estimatedGrade ? `${c.estimatedGrade}*` : "?";
  return "";
}

const FIXED_HEADERS = [
  "대분류",
  "세부구분",
  "기기명",
  "기기번호",
  "제작사",
  "사양",
  "분야",
  "정밀점검주기",
  "시행방법",
  "사용여부",
  "마지막 보수",
  "다음 예정",
  "상태",
  "확인 필요",
];

export function exportMaintenanceMatrix(params: {
  years: number[];
  rows: MatrixExportRow[];
  fileName?: string;
}): void {
  const { years, rows } = params;

  const aoa: (string | number)[][] = [
    [
      "범례: A = 실적으로 확인된 보수 · X = 확인 후 보수 안 함 · (A) = 계획(실적 미확인) · A* = 반복 패턴으로 추정 · ? = 추정 불가(확인 필요)",
    ],
    [...FIXED_HEADERS, ...years.map((y) => `${y}년`)],
  ];

  for (const r of rows) {
    aoa.push([
      r.category ?? "",
      r.sub_category ?? "",
      r.name,
      r.tag_no ?? "",
      r.maker ?? "",
      r.spec ?? "",
      r.field ?? "",
      r.cycle_raw ?? "",
      r.method ?? "",
      r.isActive ? "사용" : "중지",
      r.lastDoneYear ?? "",
      r.judge.nextDueYear ?? "",
      r.judge.classification,
      r.judge.needsDecision ? "O" : "",
      ...r.cells.map(cellText),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 20 }, // 대분류
    { wch: 14 }, // 세부구분
    { wch: 32 }, // 기기명
    { wch: 14 }, // 기기번호
    { wch: 12 }, // 제작사
    { wch: 18 }, // 사양
    { wch: 6 },  // 분야
    { wch: 12 }, // 정밀점검주기
    { wch: 8 },  // 시행방법
    { wch: 7 },  // 사용여부
    { wch: 9 },  // 마지막 보수
    { wch: 9 },  // 다음 예정
    { wch: 7 },  // 상태
    { wch: 7 },  // 확인 필요
    ...years.map(() => ({ wch: 5 })),
  ];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: FIXED_HEADERS.length + years.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "장기보수현황");

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, params.fileName ?? `설비별_장기보수현황_${stamp}.xlsx`);
}
