// 수량산출서 엑셀 출력
//
// 기초자료의 "내역서(전기)-test.xlsx" 양식을 따르되, 금액 컬럼(재료비·노무비·경비)은
// 빼고 필요한 항목만 남긴다 — 추정가 산정은 시스템 밖의 일이다.
//
//   0행: 공사명 : 2026년도 양산지사 정기점검보수공사
//   1행: 수 량 산 출 서
//   2행: 명 칭 | 규 격 | 수량 | 단위 | 작업 시작일 | 작업 종료일 | 등  급 | 비 고
//   3행~: 대분류 머리글(Ⅰ. 발전설비) → 그 그룹 항목들 → 다음 대분류 …
//
// 등급(A/B/C)은 명칭에 섞지 않고 별도 컬럼으로 뺀다 — 명칭은 순수 설비명만 담는다.
// 작업 시작일·종료일은 비워서 내보낸다. 시공사가 이 칸을 채워 되돌려주면
// 그 파일을 업로드 분석 화면에 넣어 공정관리로 이어진다.
import * as XLSX from "xlsx";

export interface StatementExportItem {
  /** 대분류 (중장기계획의 "1. 발전설비" 등) — 그룹 머리글이 된다 */
  category: string | null;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  /** A/B/C — 있으면 별도 "등급" 컬럼에 들어간다 */
  grade?: string | null;
  note: string | null;
}

/** 아라비아 숫자를 로마숫자로 — 원본 내역서가 대분류에 Ⅰ, Ⅱ, Ⅲ … 를 쓴다 */
function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

/** "1. 발전설비" → "발전설비" (앞의 번호를 떼고 로마숫자로 다시 붙이기 위해) */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\.\s*/, "").trim();
}

export function exportDesignStatement(params: {
  title: string;
  items: StatementExportItem[];
  fileName?: string;
}): void {
  const { title, items } = params;

  const aoa: (string | number)[][] = [
    [`공사명 : ${title}`],
    ["수 량 산 출 서"],
    ["명 칭", "규 격", "수량", "단위", "작업 시작일", "작업 종료일", "등  급", "비 고"],
  ];

  // 대분류 순서를 항목 순서 그대로 유지하면서 그룹핑
  const groups: { category: string; items: StatementExportItem[] }[] = [];
  for (const it of items) {
    const cat = it.category?.trim() || "(미분류)";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) last.items.push(it);
    else groups.push({ category: cat, items: [it] });
  }

  groups.forEach((g, gi) => {
    // 대분류 머리글 — 원본처럼 로마숫자를 붙인다
    aoa.push([`${toRoman(gi + 1)}. ${stripLeadingNumber(g.category)}`]);
    g.items.forEach((it, i) => {
      aoa.push([
        ` ${i + 1}) ${it.name}`,
        it.spec ?? "",
        it.qty,
        it.unit,
        "", // 작업 시작일 — 시공사가 채운다
        "", // 작업 종료일 — 시공사가 채운다
        it.grade ? `${it.grade}급` : "",
        it.note ?? "",
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 46 }, // 명칭
    { wch: 22 }, // 규격
    { wch: 7 },  // 수량
    { wch: 7 },  // 단위
    { wch: 13 }, // 작업 시작일
    { wch: 13 }, // 작업 종료일
    { wch: 9 },  // 등급
    { wch: 20 }, // 비고
  ];
  // 공사명·제목 행은 표 너비만큼 병합
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "수량산출서");

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, params.fileName ?? `수량산출서_${stamp}.xlsx`);
}
