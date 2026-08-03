// 원본 JS 파서와 새 TS 파서(API 경유)의 결과가 같은지 비교한다.
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(process.cwd(), ".data", "설계내역서-샘플.xlsx");

// ── 한국식 설계내역서를 흉내낸 워크북 ──────────────────────────────────────
const wb = XLSX.utils.book_new();

// 통째로 제외돼야 하는 시트들
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([["공 사 명"], ["○○발전본부 1호기 정기 오버홀"]]),
  "표지",
);
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["비 목", "금 액", "구성비"],
    ["재료비", 120000000, "30%"],
    ["노무비", 200000000, "50%"],
  ]),
  "원가계산서",
);

// 실제 작업항목이 있는 시트 — 자간 공백 헤더, 색인 토큰, 소계/합계 섞임
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["○○발전본부 1호기 정기 오버홀 내역서"],
    ["", "", "", "", "", ""],
    ["항  목", "명      칭", "규  격", "단위", "수  량", "작업예정일", "비고"],
    ["Ⅰ-1", "가스터빈 케이싱 분해", "GT #1", "식", 1, "2026-07-10~2026-07-15", ""],
    ["Ⅰ-2", "가스터빈 블레이드 점검", "1~4단", "EA", 96, "2026-07-16~2026-07-22", "육안+PT"],
    ["1", "", "", "", "", "", ""],
    ["Ⅱ-1", "HRSG 튜브 세정", "배열회수보일러", "M2", 1250.5, "2026.7.20", ""],
    ["", "소  계", "", "", "", "", ""],
    ["Ⅲ-1", "발전기 고정자 절연저항 측정", "Generator", "회", 4, "", ""],
    ["Ⅲ-2", "차단기 접점 정비", "MCC 반", "EA", 12, "", ""],
    ["Ⅳ-1", "압력 전송기 교정", "PIT-7610", "EA", 8, "", "DCS 연동"],
    ["Ⅳ-2", "제어밸브 포지셔너 점검", "FCV-2201", "EA", 6, "", ""],
    ["Ⅴ-1", "순환수 펌프 분해정비", "CWP 1호", "대", 2, "", ""],
    ["Ⅴ-2", "배관 보온재 교체", "6B 증기배관", "M", 340, "", ""],
    ["Ⅵ-1", "비계 설치 및 해체", "가설재", "M2", 800, "", ""],
    ["", "합  계", "", "", "", "", ""],
    ["", "* 산출기준: 설계도면 기준", "", "", "", "", ""],
    ["Ⅶ-1", "단위 없는 항목", "확인필요", "", "", "", ""],
  ]),
  "1호기 내역(기계)",
);

// 중복 항목이 반복되는 집계성 시트 (dedupe 대상)
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["품  명", "규  격", "단위", "수  량"],
    ["가스터빈 케이싱 분해", "GT #1", "식", 1],
    ["HRSG 튜브 세정", "배열회수보일러", "M2", 1250.5],
    ["신규 항목 - 냉각수 배관 교체", "8B", "M", 120],
  ]),
  "산출집계",
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
XLSX.writeFile(wb, OUT);
console.log(`테스트 엑셀 생성: ${OUT}`);

// ── 1) 원본 JS 파서 ────────────────────────────────────────────────────────
const legacy = await import(
  "file:///" + path.join(ROOT, "legacy/plantsync/src/lib/excelParser.js").replaceAll("\\", "/")
);
const buf = fs.readFileSync(OUT);
const before = await legacy.analyzeWorkbook(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  "설계내역서-테스트.xlsx",
);

// ── 2) 새 TS 파서 (Next API 경유, 저장은 하지 않음) ────────────────────────
const fd = new FormData();
fd.append("file", new Blob([buf]), "설계내역서-테스트.xlsx");
fd.append("dryRun", "1");
const res = await fetch("http://localhost:3000/api/overhaul/upload", { method: "POST", body: fd });
const json = await res.json();
if (!json.ok) {
  console.error("API 실패:", json.error);
  process.exit(1);
}
const after = json.results[0];

// ── 3) 비교 ────────────────────────────────────────────────────────────────
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const line = (label, a, b) =>
  console.log(`  ${label.padEnd(14)} 원본 ${String(a).padEnd(6)} | 이식 ${String(b).padEnd(6)} ${same(a, b) ? "OK" : "*** 불일치 ***"}`);

console.log("\n=== 집계 비교 ===");
line("시트 수", before.sheetCount, after.sheetCount);
line("전체 행", before.totalRows, after.totalRows);
line("추출 건수", before.extractedCount, after.extractedCount);
line("제외 건수", before.excludedCount, after.excludedCount);
line("확인 필요", before.needVerify.length, after.needVerifyCount);
line("분야별", JSON.stringify(before.byField), JSON.stringify(after.byField));
line("설비별", JSON.stringify(before.byEquipment), JSON.stringify(after.byEquipment));

console.log("\n=== 작업항목 상위 20건 필드 단위 비교 ===");
const keys = ["id", "field", "equipment", "name", "spec", "qty", "unit", "tag", "planStart", "planEnd", "sheetName", "sourceRow", "issues"];
let diff = 0;
for (let i = 0; i < after.sample.length; i++) {
  const a = before.tasks[i], b = after.sample[i];
  for (const k of keys) {
    if (!same(a?.[k], b?.[k])) {
      console.log(`  [${i}] ${k}: 원본 ${JSON.stringify(a?.[k])} vs 이식 ${JSON.stringify(b?.[k])}`);
      diff++;
    }
  }
}
console.log(diff === 0 ? `  ${after.sample.length}건 x ${keys.length}개 필드 전부 일치` : `  ${diff}개 필드 불일치`);

console.log("\n=== 추출된 작업항목 ===");
for (const t of before.tasks) {
  console.log(`  ${t.id}  [${t.field}/${t.equipment}]  ${t.name}  ${t.qty}${t.unit}  ${t.planStart ?? "-"}~${t.planEnd ?? "-"}  ${t.issues.join(",")}`);
}
