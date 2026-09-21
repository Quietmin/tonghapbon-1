// 수량산출서 한 바퀴 검증:
//   보수계획에서 뽑은 엑셀 → (시공사가 일정을 채움) → 업로드 분석이 다시 읽기
// 이 두 파일(statementExporter / excelParser)이 "항목ID"와 "작업 시작일·종료일"
// 컬럼 이름에 서로 동의하는지가 핵심이다. 하나만 바뀌어도 고리가 조용히 끊긴다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { exportDesignStatement } from "../src/modules/overhaul/lib/statementExporter.ts";
import { analyzeWorkbook } from "../src/modules/overhaul/lib/excelParser.ts";

let pass = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  if (cond) {
    console.log(`  ok   ${label}`);
    pass++;
  } else {
    console.log(`  FAIL ${label}${extra ? "\n       " + extra : ""}`);
    fail++;
  }
};

// exportDesignStatement는 XLSX.writeFile로 내려받기를 일으킨다(브라우저 기준).
// Node에서는 파일로 떨어지므로, 임시 폴더로 작업 디렉터리를 옮겨 받아낸다.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ohroundtrip-"));
const cwd = process.cwd();
process.chdir(tmp);

exportDesignStatement({
  title: "2026년도 정기점검보수공사",
  fileName: "stmt.xlsx",
  items: [
    { category: "1. 발전설비", name: "발전기 고정자 점검", spec: "13.8kV", qty: 1, unit: "EA", grade: "A", note: "GEN-01", itemId: 101 },
    { category: "1. 발전설비", name: "여자기 정비", spec: "-", qty: 2, unit: "EA", grade: "B", note: null, itemId: 102 },
    { category: "2. 송수전설비", name: "주변압기 절연진단", spec: "154kV", qty: 1, unit: "EA", grade: null, note: "TR-01", itemId: 103 },
  ],
});

console.log("\n[1] 내보낸 파일 모양");
const raw = XLSX.read(fs.readFileSync(path.join(tmp, "stmt.xlsx")), { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(raw.Sheets[raw.SheetNames[0]], {
  header: 1,
  blankrows: false,
  defval: "",
});
const header = aoa[2].map(String);
check("헤더에 항목ID 열이 있다", header.includes("항목ID"), `header=${header.join(" | ")}`);
check("헤더에 작업 시작일/종료일이 있다", header.includes("작업 시작일") && header.includes("작업 종료일"));
check("작업 시작일·종료일은 비어서 나간다", aoa[4][4] === "" && aoa[4][5] === "");

// ── 시공사가 일정을 채워 되돌려준 상황을 흉내낸다 ─────────────────────────
console.log("\n[2] 시공사가 일정을 채워 되돌려준 파일 재파싱");
const startCol = header.indexOf("작업 시작일");
const endCol = header.indexOf("작업 종료일");
const filled = aoa.map((row) => row.slice());
const dates: Record<number, [string, string]> = {
  101: ["2026-03-02", "2026-03-06"],
  102: ["2026-03-04", "2026-03-08"],
  103: ["2026-03-10", "2026-03-12"],
};
const idCol = header.indexOf("항목ID");
for (const row of filled) {
  const id = Number(row[idCol]);
  if (dates[id]) {
    row[startCol] = dates[id][0];
    row[endCol] = dates[id][1];
  }
}
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(filled), "수량산출서");
const buf = XLSX.write(wb2, { type: "buffer", bookType: "xlsx" }) as Buffer;

const parsed = analyzeWorkbook(new Uint8Array(buf), "내역서(전기)_시공사회신.xlsx");

check("항목 3건을 모두 추출했다", parsed.tasks.length === 3, `추출=${parsed.tasks.length}건`);

const byId = new Map(parsed.tasks.map((t) => [t.statementItemId, t]));
check("항목ID 3개가 모두 되돌아왔다", [101, 102, 103].every((id) => byId.has(id)),
  `읽힌 항목ID=${parsed.tasks.map((t) => t.statementItemId).join(",")}`);

const t101 = byId.get(101);
check("명칭에서 그룹 번호(' 1) ')가 떨어졌다", t101?.name === "발전기 고정자 점검", `name=${JSON.stringify(t101?.name)}`);
check("계획 시작일을 읽었다", t101?.planStart === "2026-03-02", `planStart=${t101?.planStart}`);
check("계획 종료일을 읽었다", t101?.planEnd === "2026-03-06", `planEnd=${t101?.planEnd}`);
check("규격을 읽었다", t101?.spec === "13.8kV", `spec=${t101?.spec}`);
check("수량·단위를 읽었다", t101?.planQty === 1 && t101?.unit === "EA");
check("분야를 전기로 분류했다", t101?.field === "전기", `field=${t101?.field}`);

const t102 = byId.get(102);
check("수량 2건도 그대로", t102?.planQty === 2, `qty=${t102?.planQty}`);
check("두 번째 항목 일정", t102?.planStart === "2026-03-04" && t102?.planEnd === "2026-03-08");

const t103 = byId.get(103);
check("다른 대분류 항목도 이어진다", t103?.name === "주변압기 절연진단", `name=${JSON.stringify(t103?.name)}`);

check("대분류 머리글 행은 작업으로 안 잡힌다",
  !parsed.tasks.some((t) => /발전설비|송수전설비/.test(t.name)),
  parsed.tasks.map((t) => t.name).join(" / "));

// ── 항목ID 열을 지워 보낸 경우도 깨지지 않아야 한다 ───────────────────────
console.log("\n[3] 시공사가 항목ID 열을 지우고 보낸 경우");
const stripped = filled.map((row) => {
  const r = row.slice();
  r[idCol] = "";
  return r;
});
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, XLSX.utils.aoa_to_sheet(stripped), "수량산출서");
const parsed2 = analyzeWorkbook(
  new Uint8Array(XLSX.write(wb3, { type: "buffer", bookType: "xlsx" }) as Buffer),
  "내역서_항목ID없음.xlsx",
);
check("여전히 3건 추출된다", parsed2.tasks.length === 3, `추출=${parsed2.tasks.length}건`);
check("항목ID는 전부 null", parsed2.tasks.every((t) => t.statementItemId === null));
check("일정은 그대로 읽힌다", parsed2.tasks.every((t) => !!t.planStart && !!t.planEnd));

process.chdir(cwd);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n결과: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
