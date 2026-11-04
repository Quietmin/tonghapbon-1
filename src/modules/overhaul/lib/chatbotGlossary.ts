// 따소미 챗봇 유사 용어집 — 서버·클라이언트 공용(순수 데이터 + 문자열 함수, DB·네트워크 없음).
//
// 세 가지를 담는다.
//   1) FAULT_REQUEST_TERMS  — "고장 사례를 찾는다"는 뜻의 표현(고장이력·고장사례·난 적 있어 …)
//   2) MANUAL_REQUEST_TERMS — "매뉴얼·노하우·방법을 찾는다"는 뜻의 표현(매뉴얼·절차서·요령·하는 법 …)
//   3) TERM_GROUPS          — 같은 대상을 가리키는 낱말 묶음(급수펌프 = BFP = boiler feed pump …)
//
// 1·2는 질문 분류(chatbotRules.ts → 도구 호출 경로로 보낼지)와 서버 프롬프트의 [필수 검색 지침]에 쓰이고,
// 3은 보관함·고장이력 검색(chatbotTools.ts)이 검색어를 같은 뜻 낱말까지 넓혀 찾는 데 쓰인다 —
// 보관함 제목은 "GT 발전기", 질문은 "가스터빈 발전기"처럼 표기가 갈려 0건이 나오던 것을 막는다.
//
// 항목 추가 방법: 같은 뜻 낱말은 TERM_GROUPS 의 해당 묶음에 넣고, 새 대상이면 묶음을 하나 더 만든다.
// 영문 약어(GT·ST·CB 처럼 3글자 이하)는 앞뒤가 영문자가 아닐 때만 맞는 것으로 친다("ST"가 "test"에 걸리지 않게).

/** 고장 사례·이력을 찾는 요청 표현 — 이 말들은 검색어에서는 빠진다(내용 낱말이 아니라 요청 낱말) */
export const FAULT_REQUEST_TERMS = [
  "고장이력", "고장 이력", "고장사례", "고장 사례", "고장보고서", "고장 보고서", "고장내역", "고장 내역",
  "장애이력", "장애 이력", "장애보고서", "장애 보고서", "사고보고서", "사고 보고서", "사고사례", "사고 사례",
  "트러블", "trouble", "이상사례", "이상 사례", "결함사례", "불량사례", "유사사례", "유사 사례", "비슷한 사례",
  "비슷한 고장", "과거 사례", "과거사례", "전례", "선례", "난 적", "났던", "발생한 적", "발생 이력", "고친 적",
  "조치 이력", "조치이력", "조치사례", "조치 사례", "정비이력", "정비 이력", "수리이력", "수리 이력",
  "원인 분석", "원인분석", "재발", "재발방지", "failure", "fault", "breakdown", "고장", "장애", "사고",
];

/** 매뉴얼·노하우·방법을 찾는 요청 표현 — 이 말들도 검색어에서는 빠진다 */
export const MANUAL_REQUEST_TERMS = [
  "매뉴얼", "메뉴얼", "메뉴월", "manual", "절차서", "지침서", "지침", "가이드라인", "가이드", "guide",
  "설명서", "취급설명서", "사용설명서", "운전지침", "운전절차", "작업절차", "작업 절차", "작업표준", "표준작업",
  "점검표", "체크리스트", "checklist", "SOP", "procedure", "how to", "howto", "기술자료", "기술 자료", "기술문서",
  "노하우", "know-how", "knowhow", "팁", "tip", "요령", "방법", "하는 법", "하는법", "어떻게", "순서", "절차",
  "점검법", "점검 방법", "정비법", "정비 방법", "교체법", "교체 방법", "조작법", "조작 방법", "사용법", "사용 방법",
  "운전법", "운전 방법", "설정법", "설정 방법", "측정법", "측정 방법", "시험법", "시험 방법", "교정법", "교정 방법",
  "해결법", "해결 방법", "해결책", "조치법", "조치 방법", "대처법", "대처 방법",
];

/** 요청 표현이 아니면서 검색어에서 빼야 하는 말(어미·조사 성격) */
const FILLER_TERMS = [
  "찾아줘", "찾아 줘", "찾아봐", "찾아", "알려줘", "알려 줘", "보여줘", "보여 줘", "검색해줘", "검색", "있어", "있나",
  "있니", "있어요", "있나요", "해줘", "주세요", "좀", "관련", "관련된", "대한", "대해", "대해서", "같은", "비슷한", "유사",
  "자료", "내용", "정보", "목록", "리스트", "최근", "전체", "모든", "사례", "이력", "내역", "기록",
];

/**
 * 같은 뜻 낱말 묶음. 묶음 하나가 "한 대상"이다 — 검색할 때 묶음 안의 낱말 중 하나라도 맞으면 그 대상을 찾은 것으로 본다.
 * 보관함 실제 제목(2026-11 기준: GT/ST 발전기, SFC 정밀점검, 보호계전기, 절연저항, GIS SF6, Cooling Water Pump 누유,
 * 루프팬 전동기 소손 등)과 지역난방·열병합 현장 용어를 바탕으로 만들었다.
 */
export const TERM_GROUPS: string[][] = [
  // ---- 주기기 ----
  ["가스터빈", "가스 터빈", "GT", "gas turbine"],
  ["증기터빈", "증기 터빈", "스팀터빈", "스팀 터빈", "ST", "steam turbine"],
  ["가스터빈 발전기", "가스터빈발전기", "GTG", "GT 발전기", "GT발전기"],
  ["증기터빈 발전기", "증기터빈발전기", "스팀터빈 발전기", "STG", "ST 발전기", "ST발전기"],
  ["발전기", "generator", "제너레이터", "GEN"],
  ["배열회수보일러", "배열회수 보일러", "폐열회수보일러", "폐열회수 보일러", "폐열보일러", "배열보일러", "HRSG"],
  ["첨두부하보일러", "첨두부하 보일러", "PLB", "peak load boiler"],
  ["보일러", "boiler"],
  ["SFC", "정지형 주파수 변환기", "정지형주파수변환기", "정지형 기동장치", "static frequency converter", "LCI"],
  ["여자기", "여자장치", "여자 장치", "excitation", "exciter", "익사이터"],
  ["AVR", "자동전압조정기", "자동전압 조정기", "자동전압조정장치", "자동 전압 조정"],
  ["OLTC", "부하시 탭절환기", "부하시탭절환기", "탭절환기", "탭 절환기", "tap changer"],
  // ---- 전력·계통 ----
  ["변압기", "트랜스", "transformer", "TR", "주변압기", "MTR"],
  ["소내변압기", "소내용 변압기", "소내용변압기", "소내 변압기", "UAT", "SST"],
  ["차단기", "breaker", "CB", "VCB", "ACB", "GCB", "MCCB", "진공차단기", "기중차단기", "발전기 차단기", "발전기차단기"],
  ["단로기", "disconnector", "DS", "89MD"],
  ["GIS", "가스절연개폐장치", "가스절연 개폐장치", "가스 절연 개폐장치", "SF6", "SF6 가스", "육불화황"],
  ["보호계전기", "보호 계전기", "계전기", "릴레이", "relay", "protective relay"],
  ["비율차동", "비율차동계전기", "비율 차동", "차동계전기", "차동 계전기", "differential"],
  ["지락", "지락사고", "지락 사고", "지락검출", "지락 검출", "ground fault", "earth fault", "접지사고", "접지 사고"],
  ["단락", "쇼트", "short circuit", "합선"],
  ["층간단락", "층간 단락", "레이어 쇼트", "interturn", "inter-turn"],
  ["절연저항", "절연 저항", "절연저항측정", "절연저항 측정", "메거", "megger", "insulation resistance", "IR"],
  ["부분방전", "부분 방전", "partial discharge", "PD"],
  ["열화진단", "열화 진단", "열화", "deterioration"],
  ["전동기", "모터", "motor"],
  ["소손", "타버림", "탄화", "burnout", "burn out", "소훼"],
  ["MCC", "모터제어반", "모터 제어반", "전동기제어반", "전동기 제어반", "motor control center"],
  ["인버터", "inverter", "VFD", "INV", "가변속드라이브", "가변속 드라이브", "드라이브"],
  ["UPS", "무정전전원장치", "무정전 전원장치", "무정전전원"],
  ["충전기", "battery charger", "배터리 충전기", "배터리충전기", "축전지 충전기", "정류기", "charger"],
  ["축전지", "배터리", "밧데리", "battery"],
  ["SCR", "사이리스터", "thyristor"],
  ["스너버", "RC 스너버", "snubber"],
  ["리액터", "reactor", "DC 리액터", "DC리액터"],
  ["브러쉬", "브러시", "brush", "카본브러쉬", "카본 브러쉬", "카본브러시"],
  ["고정자", "stator", "스테이터"],
  ["회전자", "rotor", "로터"],
  ["권선", "winding", "코일", "coil"],
  ["전원", "PSU", "파워서플라이", "파워 서플라이", "power supply", "전원공급장치", "전원 공급장치"],
  ["퓨즈", "휴즈", "fuse"],
  ["케이블", "cable", "전선", "배선", "wiring"],
  ["단자", "단자대", "terminal", "터미널"],
  ["접점", "보조접점", "보조 접점", "contact"],
  // ---- 제어·계측 ----
  ["DCS", "분산제어시스템", "분산제어 시스템", "분산 제어 시스템"],
  ["PLC", "시퀀서", "XG-5000", "XG5000", "프로그래머블 로직 컨트롤러"],
  ["Mark VIe", "MARK VIe", "MarkVIe", "Mark VI", "마크6", "마크 6", "터빈제어반", "터빈 제어반"],
  ["HMI", "운전화면", "운전 화면", "OIS", "모니터링 화면"],
  ["LCP", "현장제어반", "현장 제어반", "현장조작반", "현장 조작반", "현장반", "local control panel"],
  ["I/O 카드", "I/O카드", "IO 카드", "IO카드", "I/O Card", "IO card", "입출력카드", "입출력 카드"],
  ["마셜링 판넬", "마셜링판넬", "마샬링", "마셸링", "marshalling", "m/p"],
  ["판넬", "패널", "panel"],
  ["인터락", "인터록", "interlock"],
  ["알람", "경보", "alarm", "경고"],
  ["트렌드", "trend", "추이"],
  ["통신", "통신장애", "통신 장애", "통신불량", "통신 불량", "통신에러", "communication"],
  ["센서", "감지기", "검출기", "sensor", "detector"],
  ["화염감지기", "화염 감지기", "flame detector", "플레임 디텍터", "불꽃감지기", "화염검출기", "flame scanner"],
  ["산소 감지기", "산소감지기", "O2 센서", "산소농도계", "산소 농도계", "oxygen sensor"],
  ["가스감지기", "가스 감지기", "gas detector", "가스누설경보기", "가스 누설 경보기"],
  ["트랜스미터", "전송기", "발신기", "transmitter"],
  ["압력계", "압력 트랜스미터", "압력트랜스미터", "PIT", "pressure transmitter", "압력 지시계"],
  ["온도계", "열전대", "측온저항체", "thermocouple", "RTD"],
  ["유량계", "flowmeter", "flow meter", "유량 트랜스미터"],
  ["레벨계", "수위계", "level transmitter", "레벨 트랜스미터"],
  ["제어밸브", "제어 밸브", "조절밸브", "조절 밸브", "컨트롤밸브", "컨트롤 밸브", "control valve"],
  ["포지셔너", "positioner"],
  ["밸브", "valve", "V/V", "발브"],
  ["안전밸브", "안전 밸브", "safety valve", "릴리프밸브", "릴리프 밸브", "relief valve", "PSV"],
  // ---- 기계 ----
  ["펌프", "pump", "P/P"],
  ["급수펌프", "급수 펌프", "보일러 급수펌프", "보일러급수펌프", "BFP", "BFWP", "boiler feed pump", "feed water pump"],
  ["냉각수펌프", "냉각수 펌프", "cooling water pump", "CWP", "순환수펌프", "순환수 펌프", "circulating water pump"],
  ["복수펌프", "복수 펌프", "condensate pump", "콘덴세이트 펌프", "CEP"],
  ["순환펌프", "순환 펌프", "지역난방 순환펌프", "열수송 순환펌프", "circulation pump"],
  ["가압펌프", "가압 펌프", "부스터펌프", "부스터 펌프", "booster pump"],
  ["보충수펌프", "보충수 펌프", "makeup pump", "make-up pump"],
  ["팬", "fan", "송풍기", "blower", "블로워", "블로어"],
  ["루프팬", "루프 팬", "roof fan", "지붕팬", "옥상팬", "환기팬", "배기팬"],
  ["냉각팬", "냉각 팬", "cooling fan", "쿨링팬", "쿨링 팬"],
  ["냉각탑", "cooling tower", "쿨링타워", "쿨링 타워"],
  ["열교환기", "열 교환기", "heat exchanger", "HX", "판형열교환기", "판형 열교환기", "PHE"],
  ["복수기", "condenser"],
  ["탈기기", "deaerator", "디에어레이터", "탈기 장치", "탈기장치"],
  ["축열조", "열저장조", "축열탱크", "축열 탱크", "heat storage tank", "accumulator"],
  ["히터", "heater", "전기히터", "전기 히터", "electric heater"],
  ["열수송관", "열배관", "열수송 배관", "지역난방 배관", "이중보온관", "이중 보온관"],
  ["배관", "pipe", "piping", "파이프"],
  ["공기압축기", "공기 압축기", "컴프레서", "compressor", "에어컴프레서", "에어 컴프레서", "공압기"],
  ["연료가스", "연료 가스", "천연가스", "LNG", "fuel gas"],
  ["윤활유", "윤활", "오일", "lube oil", "루브오일", "작동유", "유압유"],
  ["베어링", "베아링", "bearing"],
  ["커플링", "coupling", "축이음"],
  ["임펠러", "impeller", "회전차"],
  ["메카니컬 씰", "메카니컬씰", "메커니컬 씰", "메커니컬씰", "미케니컬 씰", "mechanical seal", "기계적 씰", "씰", "seal"],
  ["패킹", "packing", "그랜드 패킹", "그랜드패킹", "gland packing"],
  ["가스켓", "개스킷", "개스켓", "gasket"],
  ["스트레이너", "strainer", "여과기", "필터", "filter"],
  ["방음벽", "방음 벽", "방음판넬", "sound barrier"],
  // ---- 증상·현상 ----
  ["트립", "trip", "비상정지", "비상 정지", "자동정지", "자동 정지", "탈락", "shutdown", "정지"],
  ["누설", "누수", "누유", "누기", "리크", "leak", "leakage", "새는"],
  ["진동", "vibration", "떨림", "진동과다", "진동 과다"],
  ["소음", "이음", "이상음", "이상소음", "이상 소음", "noise"],
  ["과열", "고온", "온도상승", "온도 상승", "발열", "overheat", "overheating"],
  ["캐비테이션", "공동현상", "공동 현상", "cavitation"],
  ["부식", "corrosion"],
  ["마모", "마멸", "wear"],
  ["균열", "crack", "크랙", "깨짐"],
  ["파손", "손상", "damage", "파괴"],
  ["막힘", "폐색", "clogging"],
  ["헌팅", "hunting", "요동", "불안정"],
  ["오동작", "오작동", "오류동작", "오신호", "malfunction"],
  ["미동작", "동작불가", "동작 불가", "기동불가", "기동 불가", "작동불가", "작동 불가", "안 돌", "안돌", "안 켜"],
  ["절체", "절환", "전환", "switchover", "changeover"],
  ["교정", "캘리브레이션", "calibration", "영점조정", "영점 조정", "스팬조정", "스팬 조정"],
  ["백업", "backup"],
  ["셋팅", "세팅", "설정값", "셋팅값", "setting"],
  ["분해점검", "분해 점검", "오버홀", "overhaul", "O/H"],
  ["정밀점검", "정밀 점검", "상세점검", "상세 점검", "정밀진단", "정밀 진단"],
];

// ---------------------------------------------------------------------------
// 질문 의도
// ---------------------------------------------------------------------------

const lower = (s: string) => s.toLowerCase();
const squash = (s: string) => lower(s).replace(/\s+/g, "");
const isShortAscii = (t: string) => /^[A-Za-z0-9/]{1,3}$/.test(t);

/** term 이 text 안에 있는가 — 짧은 영문 약어는 앞뒤가 영문자가 아닐 때만(ST ≠ test) */
function hasTerm(text: string, term: string): boolean {
  if (isShortAscii(term)) {
    const esc = term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z])${esc}([^A-Za-z]|$)`, "i").test(text);
  }
  return squash(text).includes(squash(term));
}

const SYMPTOM_START = TERM_GROUPS.findIndex((g) => g[0] === "트립");
const SYMPTOM_GROUPS = TERM_GROUPS.slice(SYMPTOM_START, TERM_GROUPS.findIndex((g) => g[0] === "절체"));

/** 고장 사례·이력을 찾는 질문인가(요청 표현 또는 고장 증상 낱말) */
export function isFaultSearchQuestion(q: string): boolean {
  return FAULT_REQUEST_TERMS.some((t) => hasTerm(q, t)) || SYMPTOM_GROUPS.some((g) => g.some((t) => hasTerm(q, t)));
}

/** 매뉴얼·노하우·방법을 찾는 질문인가 */
export function isManualSearchQuestion(q: string): boolean {
  return MANUAL_REQUEST_TERMS.some((t) => hasTerm(q, t));
}

/** 서버 프롬프트에 싣는 요약 — 모델이 "어떤 말이 고장/매뉴얼 찾기인지"를 낱말 단위로도 알게 한다 */
export function glossaryPromptBlock(): string {
  const pick = (arr: string[]) => [...new Set(arr.filter((t) => !/^[a-z -]+$/.test(t)))].join(", ");
  return `[유사 용어집 — 의도 판단과 검색어 작성에 쓴다]
고장 찾기 표현(이 말이나 같은 뜻이면 (1) 고장 찾기): ${pick(FAULT_REQUEST_TERMS)}, 그리고 트립·누설·소손·지락·오동작·기동불가·진동·과열 같은 고장 증상 낱말
매뉴얼 찾기 표현(이 말이나 같은 뜻이면 (2) 매뉴얼·노하우·방법 찾기): ${pick(MANUAL_REQUEST_TERMS)}
검색어 작성: search_manuals·search_failure_history 의 keyword 에는 설비·부품·증상 낱말만 넣는다("찾아줘", "사례", "매뉴얼", "방법" 같은 요청 낱말은 넣지 않는다).
같은 뜻 낱말(예: 급수펌프=BFP=boiler feed pump, GT=가스터빈, 메거=절연저항, 누유=누설)은 검색 도구가 자동으로 넓혀 찾으므로 한 가지 표기만 넣으면 된다.`;
}

// ---------------------------------------------------------------------------
// 검색어 넓히기
// ---------------------------------------------------------------------------

const REQUEST_WORDS = [...FAULT_REQUEST_TERMS, ...MANUAL_REQUEST_TERMS, ...FILLER_TERMS].sort((a, b) => b.length - a.length);

export interface ExpandedQuery {
  /** 대상 하나당 낱말 묶음 하나 — 묶음 안의 낱말 중 하나라도 맞으면 그 대상이 맞은 것 */
  concepts: string[][];
  /** DB 에 보낼 낱말 전부(중복 없음, 상한 있음) */
  terms: string[];
}

/**
 * 검색어 → 같은 뜻 낱말까지 넓힌 대상 목록.
 * "급수펌프 캐비테이션 사례 찾아줘" → [[급수펌프, BFP, boiler feed pump …], [캐비테이션, 공동현상, cavitation]]
 * 묶음에 없는 낱말은 그 낱말 하나짜리 대상으로 남긴다. 요청 낱말("사례", "찾아줘")은 뺀다.
 */
export function expandQuery(keyword: string, maxTerms = 16): ExpandedQuery {
  const text = keyword.replace(/[,.?!~()[\]{}"'`]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { concepts: [], terms: [] };

  // 1) 묶음 찾기 — 원문 그대로에서 찾는다(요청 낱말을 먼저 지우면 "ground fault"·"지락사고"가 깨진다).
  //    더 긴 낱말에 포함되는 짧은 낱말 묶음은 버린다("급수펌프"가 맞으면 일반어 "펌프" 묶음은 따로 세지 않고,
  //    "정지형 주파수 변환기"가 맞으면 "정지"(트립)는 세지 않는다).
  const hits: { group: string[]; term: string }[] = [];
  for (const group of TERM_GROUPS) {
    const term = group
      .filter((t) => hasTerm(text, t))
      .sort((a, b) => squash(b).length - squash(a).length)[0];
    if (term) hits.push({ group, term });
  }
  const kept = hits.filter(
    (h) => !hits.some((o) => o !== h && squash(o.term).length > squash(h.term).length && squash(o.term).includes(squash(h.term))),
  );

  // 2) 묶음에 걸리지 않은 낱말은 그대로 대상으로 남긴다 — 요청 낱말("사례", "찾아줘", "fault")은 빼고
  let rest = ` ${text} `;
  for (const w of REQUEST_WORDS) {
    rest = /^[A-Za-z -]+$/.test(w)
      ? rest.replace(new RegExp(`(^|[^A-Za-z])${w.replace(/[-]/g, "\\-")}(?=[^A-Za-z]|$)`, "gi"), "$1 ")
      : rest.split(w).join(" ");
  }
  rest = rest.replace(/\s+/g, " ").trim();
  const covered = (tok: string) => kept.some((h) => h.group.some((t) => squash(tok).includes(squash(t)) || squash(t).includes(squash(tok))));
  const loose = rest
    .split(" ")
    .filter((tok) => tok.length >= 2 && !covered(tok))
    .map((tok) => [tok]);

  const concepts = [...kept.map((h) => h.group), ...loose];
  // 대상마다 돌아가며 하나씩 뽑아 상한 안에서도 모든 대상이 검색되게 한다
  const terms: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; terms.length < maxTerms; i++) {
    let added = false;
    for (const c of concepts) {
      const t = c[i];
      if (t === undefined) continue;
      added = true;
      if (seen.has(lower(t)) || terms.length >= maxTerms) continue;
      seen.add(lower(t));
      terms.push(t);
    }
    if (!added) break;
  }
  return { concepts, terms };
}

/** 이 글이 넓힌 검색어의 대상 몇 개와 맞는가 — 많이 맞을수록 앞에 둔다 */
export function conceptScore(text: string, q: ExpandedQuery): number {
  return q.concepts.reduce((n, c) => n + (c.some((t) => hasTerm(text, t)) ? 1 : 0), 0);
}
