// 판교지사 시연용 엑셀 — make-gwanggyo-sample.js를 판교 기간·이름으로 감싸고 다듬는다.
//   node make-pangyo-sample.js <출력폴더> <시작일> <종료일>
//
// 원본과 다른 점 (판교는 현장 시연 지사라 설비 구성을 실제 열원 현장답게 맞춘다)
//   - "10. 건물·부대설비"(지붕 방수·배수로 준설·방음벽)를 뺀다 — 건축·토목은 정비 대상이 아니다
//   - 그 3건이 맡던 "선택" 판정(주기를 시스템이 정할 수 없어 사람이 판단)은 설비 항목으로 대신한다
//   - 항목이 2~3건뿐이던 수처리·계장공기설비를 실제 현장 수준으로 채운다
const fs = require("node:fs");
const path = require("node:path");

const [outDir, start, end] = process.argv.slice(2);
if (!outDir || !start || !end) {
  console.error("사용법: node make-pangyo-sample.js <출력폴더> <시작일> <종료일>");
  process.exit(1);
}

let src = fs.readFileSync(path.join(__dirname, "..", "make-gwanggyo-sample.js"), "utf8");
const must = (re, label) => {
  if (!re.test(src)) throw new Error(`원본 생성기에서 ${label}을(를) 찾지 못했다 — 원본이 바뀌었는지 확인`);
};

src = src.replace(/const PERIOD = \{ start: "[^"]+", end: "[^"]+" \};/, `const PERIOD = { start: "${start}", end: "${end}" };`);
src = src.split("광교지사").join("판교지사");

// 건물·부대설비 묶음 삭제
const BLD = /\n  \/\/ "선택"으로 빠지는 설비[^\n]*\n  \["10\. 건물·부대설비", \[[\s\S]*?\n  \]\],/;
must(BLD, "건물·부대설비 묶음");
src = src.replace(BLD, "");

// 덧붙일 항목 — 원본의 eq(이름, 태그, 제작사, 규격, 마지막보수, 주기, 등급, 작업, 옵션) 형식
const insertAfter = (anchor, lines) => {
  const re = new RegExp(`(\\n[^\\n]*${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*)`);
  must(re, anchor);
  src = src.replace(re, `$1\n${lines.map((l) => "    " + l).join("\n")}`);
};

insertAfter('eq("폐수처리설비 점검"', [
  'eq("순수 저장탱크 내부점검", "WT-TK01", "한국탱크", "순수 300㎥", 2021, 5, "B", ["", 1, "식", "insp"]),',
  'eq("응축수 정화설비 필터 교체", "CPF-01", "한국수처리", "카트리지 필터 2계열", 2024, 2, "B", ["", 2, "계열", "insp"], { cycleRaw: "차압 상승 시" }),',
  'eq("보충수 연화장치 점검", "SF-01", "한국수처리", "나트륨형 2계열", 2023, 3, "B", ["", 2, "계열", "insp"]),',
]);
insertAfter('eq("계장용 공기건조기 점검"', [
  'eq("계장공기 리시버탱크 점검", "IA-RT01", "한국탱크", "10㎥ 2기", 2023, 3, "B", ["", 2, "기", "insp"]),',
  'eq("계장공기 주배관 누설점검", "IA-PL01", "대한배관", "25A~50A 계통 일체", 2024, 2, "B", ["", 1, "식", "insp"]),',
  'eq("계장공기 필터 교체", "IA-FL01", "아틀라스콥코", "라인필터 12EA", 2024, 2, "C", ["", 12, "EA", "insp"], { cycleRaw: "필요시" }),',
]);
insertAfter('eq("드레인 밸브 일괄 점검"', [
  'eq("배관 보온재 손상부 보수", "IN-01", "한국보온", "고온배관 보온 일체", 2023, 3, "B", ["", 1, "식", "insp"], { cycleRaw: "실내: 3년 주기, 실외: 2년 주기" }),',
]);

const tmp = path.join(__dirname, ".tmp-pangyo-sample.js");
fs.writeFileSync(tmp, src, "utf8");
process.argv[2] = path.resolve(outDir);
try {
  require(tmp);
} finally {
  fs.unlinkSync(tmp);
}
