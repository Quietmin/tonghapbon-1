// 중장기 보수계획 구동확인용 합성 테스트 파일을 만든다.
// 실제 회사 데이터가 아니다 — public/verify.html이 이 파일로 판정 로직을 재검증한다.
//
// 실제 파일과 같은 열 배치(설비구분=1, 기기명=2, 기기번호=3, 제작사=4, 사양=5,
// 연도=6~15, 예방점검주기=16, 정밀점검주기=17, 시행방법=18, 준공년도=19)로 만든다.
// 7개 설비로 필수/선택/불필요 전 케이스와 O/H 필터링을 커버한다.
// 등급은 전부 2025년 이하로만 채운다 — 미래에 이 스크립트를 다시 돌려도
// "실행 시점보다 과거"라는 전제가 깨지지 않도록.
import * as XLSX from "xlsx";

const YEARS = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const COL0 = 6; // 2021이 들어가는 열

function row(opts) {
  const r = new Array(20).fill("");
  r[1] = opts.category ?? "";
  r[2] = opts.name ?? "";
  r[3] = opts.tagNo ?? "";
  r[4] = opts.maker ?? "테스트제작사";
  r[5] = opts.spec ?? "";
  for (const [year, grade] of Object.entries(opts.grades ?? {})) {
    r[COL0 + YEARS.indexOf(Number(year))] = grade;
  }
  r[16] = opts.patrol ?? "월간";
  r[17] = opts.cycle ?? "";
  r[18] = opts.method ?? "O/H";
  r[19] = opts.completion ?? "20년 준공";
  return r;
}

const header = new Array(20).fill("");
header[1] = "설비구분";
header[2] = "기 기 명";
header[3] = "기기번호";
header[4] = "제작사";
header[5] = "사양";
header[6] = "중장기 보수계획(등급)";
header[16] = "예방점검\n주기";
header[17] = "정밀점검주기";
header[18] = "시행방법";
header[19] = "준공년도";

const yearRow = new Array(20).fill("");
YEARS.forEach((y, i) => (yearRow[COL0 + i] = y));

const categoryRow = new Array(20).fill("");
categoryRow[1] = "1. 발전설비";
categoryRow[3] = "[구동확인용 테스트 대분류, 실제 자료 아님]";

const aoa = [
  header,
  yearRow,
  categoryRow,
  row({ name: "구동확인 발전기 A (1년 주기, 도래)", tagNo: "TAG-001", spec: "TEST SPEC A", grades: { 2025: "C" }, cycle: "1년" }),
  row({ name: "구동확인 발전기 B (2년 주기, 기한초과)", tagNo: "TAG-002", spec: "TEST SPEC B", grades: { 2023: "A" }, cycle: "2년" }),
  row({ name: "구동확인 발전기 C (3년 주기, 미도래)", tagNo: "TAG-003", spec: "TEST SPEC C", grades: { 2025: "A" }, cycle: "3년" }),
  row({ name: "구동확인 발전기 D (주기 조건부, 판단필요)", tagNo: "TAG-004", spec: "TEST SPEC D", cycle: "실내: 3년 주기, 실외: 2년 주기" }),
  row({ name: "구동확인 발전기 E (필요시, 판단필요)", tagNo: "TAG-005", spec: "TEST SPEC E", cycle: "필요시", method: "경상정비" }),
  row({ name: "구동확인 발전기 F (이력없음, 판단필요)", tagNo: "TAG-006", spec: "TEST SPEC F", cycle: "2년" }),
  row({ name: "구동확인 발전기 G (필수이지만 O/H 아님)", tagNo: "TAG-007", spec: "TEST SPEC G", grades: { 2025: "B" }, cycle: "1년", method: "경상보수" }),
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa);
XLSX.utils.book_append_sheet(wb, ws, "1. 발전설비");
XLSX.writeFile(wb, "public/fixtures/maintenance-plan-sample.xlsx");
console.log("생성: public/fixtures/maintenance-plan-sample.xlsx (설비 7건)");
