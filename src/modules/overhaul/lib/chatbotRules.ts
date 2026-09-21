// 조회형 챗봇 질문 해석 — getChatbotSnapshot 결과만 읽고, 새 계산식이나 추측값을 만들지 않는다
//
// 원본: AI-Do-Sample/src/lib/chatbotRules.js (로직 그대로, snapshot 타입만 이 저장소에 맞춤)
import { FIELDS } from "./progress";
import type { ChatbotSnapshot, EquipmentSnapshot } from "./chatbotSnapshot";

// excelParser.ts가 분류하는 설비 분류 기준 — 질문에 설비명이 "언급됐는지" 감지하는 용도로만 사용,
// 실제 존재 여부·수치는 항상 snapshot.byEquipment로만 판단한다
const KNOWN_EQUIPMENT_TOKENS = ["GT", "ST", "HRSG", "DH", "발전기", "전기설비", "제어설비", "펌프", "밸브", "배관", "비계"];

export const FAQ_QUESTIONS = [
  "전체 공정률 몇 %야?",
  "기계 분야 진행률은?",
  "전기 분야 진행률은?",
  "제어 분야 진행률은?",
  "설비별 공정률 보여줘",
  "계획보다 얼마나 늦어?",
  "지연 위험 작업 보여줘",
  "완료·진행·대기 작업 수는?",
];

const MUTATION_RE = /(삭제|지워|수정|변경해|바꿔|등록해|입력해|처리해|업로드해)/;
// 고장이력 도메인 질문 감지 — 이 챗봇은 아직 고장이력 데이터에 연결되어 있지 않으므로,
// 오버홀 공정 데이터로 잘못 답하지 않도록 먼저 걸러내고 "연결 안 됨"을 솔직히 안내한다.
const FAILURE_RE = /고장|장애\s*이력|failure/i;
const DELAY_LIST_RE = /지연.*(위험|작업|공정)|위험.*(작업|공정)/;
const PLANNED_GAP_RE = /계획.*(얼마나|차이|보다|늦|빠르)/;
const COUNT_RE = /(완료|진행\s*중|대기).*(몇|건|수)|작업\s*수|몇\s*건/;
const EQUIP_LIST_RE = /설비\s*별|설비\s*현황|설비들/;
const OVERALL_RE = /전체|총|오버홀|진도|몇\s*프로|퍼센트|%/;

export type AnswerKind = "answer" | "no_data" | "clarify" | "unsupported" | "refused";

export interface Answer {
  kind: AnswerKind;
  text: string;
  suggestions?: string[];
  data?: Record<string, unknown>;
}

export type ChatIntent = "overall" | "field" | "equipment" | "equipmentList" | "plannedGap" | "delayRisk" | "counts" | "unsupported";

export interface Classification {
  intent: ChatIntent;
  fields?: string[];
  equipment?: string[];
}

function baselineNote(snapshot: ChatbotSnapshot): string {
  const tag = snapshot.dataSource === "uploaded" ? "업로드 데이터" : "";
  const parts: string[] = [];
  if (tag) parts.push(tag);
  if (snapshot.planBaselineDate) parts.push(`기준일 ${snapshot.planBaselineDate}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

function noDataGuide(): Answer {
  return {
    kind: "no_data",
    text: '현재 등록된 공정 데이터가 없습니다. "업로드 분석"에서 엑셀을 업로드하거나 "실적 입력"에서 실적을 입력한 뒤 다시 질문해 주세요.',
  };
}

function noValidPlanMessage(): Answer {
  return {
    kind: "no_data",
    text: "등록된 작업은 있지만 유효한 계획수량이 없어 공정률을 계산할 수 없습니다. 업로드 데이터의 계획수량을 확인하거나 실적을 입력해 주세요.",
  };
}

// 고장이력은 아직 챗봇에 연결되지 않았다 — 추측하지 않고 솔직하게 안내만 한다.
function failureNotConnected(): Answer {
  return {
    kind: "no_data",
    text: "현재 시스템에 등록된 데이터만으로는 확인하기 어려워요. 고장이력 조회는 아직 이 챗봇에 연결되지 않았어요.",
  };
}

function matchField(question: string): string[] {
  return FIELDS.filter((f) => question.includes(f));
}

function matchEquipment(question: string, snapshot: ChatbotSnapshot): { mentioned: boolean; tokens?: string[]; matches?: EquipmentSnapshot[] } {
  const q = question.toUpperCase();
  const mentioned = KNOWN_EQUIPMENT_TOKENS.filter((tok) => q.includes(tok.toUpperCase()));
  if (mentioned.length === 0) return { mentioned: false };
  const byEquipment = snapshot.byEquipment || [];
  const matches = byEquipment.filter((e) => mentioned.some((tok) => e.equipment.toUpperCase().includes(tok.toUpperCase())));
  return { mentioned: true, tokens: mentioned, matches };
}

function answerOverall(snapshot: ChatbotSnapshot): Answer {
  if (!snapshot.canCompute) return noValidPlanMessage();
  return {
    kind: "answer",
    text: `전체 공정률은 ${snapshot.overall}%입니다.${baselineNote(snapshot)}`,
    data: { type: "overall", overall: snapshot.overall, planned: snapshot.plannedOverall, counts: snapshot.counts },
  };
}

function answerField(field: string, snapshot: ChatbotSnapshot): Answer {
  if (!snapshot.canCompute) return noValidPlanMessage();
  const value = snapshot.byField?.[field];
  return {
    kind: "answer",
    text: `${field} 분야 공정률은 ${value}%입니다.${baselineNote(snapshot)}`,
    data: { type: "field", field, value },
  };
}

function clarifyFields(fields: string[]): Answer {
  return {
    kind: "clarify",
    text: "어느 분야를 말씀하시는지 선택해 주세요.",
    suggestions: fields.map((f) => `${f} 분야 진행률은?`),
  };
}

function answerEquipmentList(snapshot: ChatbotSnapshot): Answer {
  if (!snapshot.canCompute) return noValidPlanMessage();
  const list = [...(snapshot.byEquipment || [])].sort((a, b) => b.count - a.count);
  if (list.length === 0) return noValidPlanMessage();
  const shown = list.slice(0, 7);
  const rest = list.length - shown.length;
  const line = shown.map((e) => `${e.equipment} ${e.progress}%`).join(" · ");
  const more = rest > 0 ? ` (외 ${rest}건, 작업 관리에서 전체 확인 가능)` : "";
  return {
    kind: "answer",
    text: `설비별 공정률: ${line}${more}${baselineNote(snapshot)}`,
    data: { type: "equipmentList", items: shown, rest },
  };
}

function unsupportedEquipment(tokens: string[], snapshot: ChatbotSnapshot): Answer {
  const known = (snapshot.byEquipment || []).map((e) => e.equipment).join(", ") || "없음";
  return {
    kind: "unsupported",
    text: `현재 데이터에 '${tokens.join(", ")}' 설비 작업을 확인할 수 없습니다. 등록된 설비: ${known}`,
  };
}

function clarifyEquipment(matches: EquipmentSnapshot[]): Answer {
  return {
    kind: "clarify",
    text: "어느 설비를 말씀하시는지 선택해 주세요.",
    suggestions: matches.map((m) => `${m.equipment} 공정률 알려줘`),
  };
}

function answerSingleEquipment(entry: EquipmentSnapshot, snapshot: ChatbotSnapshot): Answer {
  return {
    kind: "answer",
    text: `${entry.equipment}(${entry.field}) 공정률은 ${entry.progress}%입니다. 관련 작업 ${entry.count}건.${baselineNote(snapshot)}`,
    data: { type: "equipment", equipment: entry.equipment, field: entry.field, progress: entry.progress, count: entry.count },
  };
}

function answerPlannedGap(snapshot: ChatbotSnapshot): Answer {
  if (!snapshot.canCompute || snapshot.plannedOverall === null || snapshot.overall === null) return noValidPlanMessage();
  const gap = Math.round((snapshot.overall - snapshot.plannedOverall) * 10) / 10;
  const state = gap >= 0 ? "앞서" : "뒤처져";
  return {
    kind: "answer",
    text: `현재 ${snapshot.overall}% / 계획 ${snapshot.plannedOverall}% → 계획보다 ${Math.abs(gap)}%p ${state} 있습니다.${baselineNote(snapshot)}`,
    data: { type: "plannedGap", overall: snapshot.overall, planned: snapshot.plannedOverall, gap },
  };
}

function answerDelayRisk(snapshot: ChatbotSnapshot): Answer {
  if (!snapshot.canCompute || snapshot.delayRiskTasks === null || snapshot.delayRiskCount === null) return noValidPlanMessage();
  if (snapshot.delayRiskCount === 0) {
    return {
      kind: "answer",
      text: `현재 지연 위험 작업이 없습니다.${baselineNote(snapshot)}`,
      data: { type: "delayRisk", count: 0, items: [], rest: 0 },
    };
  }
  const shown = snapshot.delayRiskTasks.slice(0, 5);
  const rest = snapshot.delayRiskCount - shown.length;
  const line = shown.map((t) => `${t.equipment} ${t.name}(${t.progress}%)`).join(", ");
  const more = rest > 0 ? ` 외 ${rest}건` : "";
  return {
    kind: "answer",
    text: `지연 위험 작업 ${snapshot.delayRiskCount}건: ${line}${more}${baselineNote(snapshot)}`,
    data: { type: "delayRisk", count: snapshot.delayRiskCount, items: shown, rest },
  };
}

function answerCounts(snapshot: ChatbotSnapshot): Answer {
  const c = snapshot.counts;
  return {
    kind: "answer",
    text: `전체 ${c.total}건 중 완료 ${c.done}건 · 진행 중 ${c.inProgress}건 · 대기 ${c.waiting}건입니다.${baselineNote(snapshot)}`,
    data: { type: "counts", counts: c },
  };
}

function unsupportedFallback(): Answer {
  return {
    kind: "unsupported",
    text: "아직 지원하지 않는 질문입니다. 아래 버튼 중 하나를 선택하거나, 비슷한 표현으로 다시 질문해 주세요.",
    suggestions: FAQ_QUESTIONS,
  };
}

/**
 * 질문 텍스트 + getChatbotSnapshot 결과 → Answer
 * 이 함수는 DB에 접근하지 않는다(순수 함수) — 매 질문마다 최신 snapshot을 넘겨서 호출해야 최신 데이터가 반영된다.
 */
export function answerQuestion(question: string, snapshot: ChatbotSnapshot): Answer {
  const q = (question || "").trim();
  if (!q) return { kind: "unsupported", text: "질문을 입력해 주세요.", suggestions: FAQ_QUESTIONS };

  if (MUTATION_RE.test(q)) {
    return {
      kind: "refused",
      text: '이 챗봇은 조회만 가능합니다. 실적 수정·삭제는 "실적 입력" 화면에서 직접 진행해 주세요.',
    };
  }

  // 고장이력 도메인은 오버홀 데이터 유무와 무관하게 먼저 판단한다 — 오버홀 공정 데이터로
  // 잘못 답하지 않도록, 그리고 오버홀 데이터가 비어 있어도 "공정 데이터 없음"이 아니라
  // "고장이력 미연결"이라는 정확한 이유를 안내하도록.
  if (FAILURE_RE.test(q)) return failureNotConnected();

  if (snapshot.dataSource === "empty") return noDataGuide();

  if (DELAY_LIST_RE.test(q)) return answerDelayRisk(snapshot);
  if (PLANNED_GAP_RE.test(q)) return answerPlannedGap(snapshot);
  if (COUNT_RE.test(q)) return answerCounts(snapshot);
  if (EQUIP_LIST_RE.test(q)) return answerEquipmentList(snapshot);

  const eq = matchEquipment(q, snapshot);
  if (eq.mentioned) {
    if (!snapshot.canCompute) return noValidPlanMessage();
    const matches = eq.matches || [];
    if (matches.length === 0) return unsupportedEquipment(eq.tokens || [], snapshot);
    if (matches.length > 1) return clarifyEquipment(matches);
    return answerSingleEquipment(matches[0], snapshot);
  }

  const fields = matchField(q);
  if (fields.length > 0) {
    if (fields.length > 1) return clarifyFields(fields);
    return answerField(fields[0], snapshot);
  }

  if (OVERALL_RE.test(q)) return answerOverall(snapshot);

  return unsupportedFallback();
}

// GPT 분류 결과(intent/fields/equipment)를 기존 답변 함수에 그대로 꽂아 넣는다 — 숫자·문장은 항상 이 파일의 기존 함수가 만든다.
// classification.equipment/fields는 서버(classify 라우트)가 이미 허용 목록으로 걸러준 값만 들어온다는 전제.
export function answerFromClassification(classification: Classification | null, snapshot: ChatbotSnapshot): Answer {
  if (!classification || classification.intent === "unsupported") return unsupportedFallback();
  const intent = classification.intent;
  const fields = classification.fields || [];
  const equipment = classification.equipment || [];

  if (intent === "delayRisk") return answerDelayRisk(snapshot);
  if (intent === "plannedGap") return answerPlannedGap(snapshot);
  if (intent === "counts") return answerCounts(snapshot);
  if (intent === "equipmentList") return answerEquipmentList(snapshot);

  if (intent === "equipment") {
    if (!snapshot.canCompute) return noValidPlanMessage();
    const matches = (snapshot.byEquipment || []).filter((e) => equipment.includes(e.equipment));
    if (matches.length === 0) return unsupportedFallback();
    if (matches.length > 1) return clarifyEquipment(matches);
    return answerSingleEquipment(matches[0], snapshot);
  }

  if (intent === "field") {
    if (!snapshot.canCompute) return noValidPlanMessage();
    const valid = fields.filter((f) => (FIELDS as readonly string[]).includes(f));
    if (valid.length === 0) return unsupportedFallback();
    if (valid.length > 1) return clarifyFields(valid);
    return answerField(valid[0], snapshot);
  }

  if (intent === "overall") return answerOverall(snapshot);

  return unsupportedFallback();
}

export type ClassifyFn = (question: string, equipmentNames: string[]) => Promise<Classification | null>;

/**
 * 로컬 규칙(answerQuestion)을 먼저 시도하고, 그 결과가 'unsupported'일 때만 classifyFn(자유 질문 해석,
 * 보통 서버의 GPT 분류 API를 부르는 함수)을 호출한다. classifyFn은 실패 시 반드시 null을 반환해야 하며,
 * 이 함수는 그 어떤 경우에도(호출 안 함 / 실패 / 예외 / 검증 탈락) 로컬 답변으로 안전하게 대체한다.
 */
export async function answerQuestionWithAI(question: string, snapshot: ChatbotSnapshot, classifyFn?: ClassifyFn): Promise<Answer> {
  const local = answerQuestion(question, snapshot);
  if (local.kind !== "unsupported") return local;
  if (typeof classifyFn !== "function") return local;

  try {
    const equipmentNames = (snapshot.byEquipment || []).map((e) => e.equipment);
    const classification = await classifyFn(question, equipmentNames);
    if (!classification) return local;
    const aiAnswer = answerFromClassification(classification, snapshot);
    if (aiAnswer.kind === "unsupported") return local;
    return aiAnswer;
  } catch {
    return local;
  }
}
