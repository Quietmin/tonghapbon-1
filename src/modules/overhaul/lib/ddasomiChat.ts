// 따소미 챗봇 응답 결정 로직 — UI(ChatbotDock 등)의 상태 관리에서 분리해 순수 함수로 테스트 가능하게 유지한다.
//
// 원본: AI-Do-Sample/src/lib/ddasomiChat.js (그대로)
import { answerQuestion, isCrossModuleQuestion, type AnswerKind } from "./chatbotRules";
import { toDdasomiText } from "./ddasomiVoice";
import type { ChatbotSnapshot } from "./chatbotSnapshot";
import type { AskFn } from "./chatbotAI";
import type { DocMatch } from "@/modules/docgen/lib/docgenSearch";

const APOLOGY_TEXT = "잠시 문제가 생겼어요. 공정 데이터를 다시 확인해볼게요.";
// 고장이력·매뉴얼 등 다른 모듈 조회는 서버 GPT만 할 수 있다 — 꺼져 있으면 꺼져 있다고 정확히 알린다.
const AI_DISABLED_TEXT =
  "고장이력·매뉴얼·설비 검색은 AI 연결이 필요한데, 아직 서버에 AI 설정이 되어 있지 않아요. 관리자가 배포 환경변수(OPENAI_API_KEY)를 설정하면 바로 쓸 수 있어요.";
const AI_ERROR_TEXT = "조회 중에 연결이 잠시 불안정했어요. 조금 뒤에 다시 물어봐 주세요.";

export type SearchFn = (message: string) => Promise<{ ok: true; matches: DocMatch[] } | null>;

export interface DdasomiReply {
  text: string;
  kind: AnswerKind | "error" | "documents";
  suggestions?: string[];
  /** kind === "documents" 일 때만 채워진다 — 매뉴얼/고장보고서 검색 결과 */
  matches?: DocMatch[];
}

/**
 * message + snapshot(getChatbotSnapshot 결과) → 화면에 표시할 DdasomiReply
 *
 * askFn(message, snapshot) => Promise<{ ok:true, answer:string } | null> — 보통 chatbotAI.askDdasomi.
 * askFn이 없거나 실패(null)해도 항상 안전하게 로컬 규칙(answerQuestion) 응답으로 대체된다.
 *
 * searchFn(message) => Promise<{ ok:true, matches } | null> — 보통 docgenSearch.searchDocgenDocuments.
 * 로컬 규칙이 숫자로 확실히 답하지 못했을 때("no_data"·"unsupported") 시도한다.
 * "unsupported"뿐 아니라 "no_data"도 포함하는 이유: 오버홀 데이터가 비어 있으면
 * (dataSource === "empty") chatbotRules.ts가 질문 내용과 무관하게 전부 no_data로
 * 답한다 — 숫자 질문이 아닌 문서 질문도 똑같이 막혀 버리므로 여기서 먼저 걸러 준다.
 * 매칭 문서를 찾으면 그 카드로 바로 답한다(열 수 있는 링크가 GPT 설명보다 낫다).
 * 못 찾으면 GPT 경로로 계속 간다 — 서버 GPT는 도구(chatbotTools.ts)로 고장이력·
 * 보관함·설비·보수계획·현황을 직접 조회할 수 있다.
 *
 * 공정 데이터가 없는 경우(no_data)에도 GPT에 보낸다 — 데이터가 없어도 일반 질문·정비 지식·현장 점검 요령·
 * 시스템 사용법에는 답할 수 있어야 하기 때문이다(해커톤 시연 요구). 수치를 지어내지 않도록 하는 규칙은
 * 서버 프롬프트(api/overhaul/chatbot/route.ts)가 담당하며, GPT가 꺼져 있거나 실패하면 기존 로컬 안내문으로 대체된다.
 *
 * 실적 수정/삭제 요청은 GPT에 보내지 않고 즉시 처리한다 — GPT는 실제로 아무 것도
 * 수행할 수 없으므로, 이런 요청을 보내면 "삭제했다"처럼 실제로 하지 않은 일을 한 것처럼 답할 위험이 있다.
 */
export async function getDdasomiReply(
  message: string,
  snapshot: ChatbotSnapshot,
  askFn?: AskFn,
  searchFn?: SearchFn,
): Promise<DdasomiReply> {
  const local = answerQuestion(message, snapshot);
  // 고장이력·매뉴얼·현황 등은 로컬 규칙이 못 본다 — "공정 데이터 없음" 단락에 걸리지 않고
  // 문서 검색과 GPT(도구 호출)로 보낸다.
  const crossModule = isCrossModuleQuestion(message);
  if (local.kind === "refused") {
    return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
  }

  // 문서(매뉴얼·고장보고서) 검색이 먼저다 — 결과는 열 수 있는 카드로 나온다.
  // 찾아도 여기서 끝내지 않고 GPT 에 근거로 넘긴다: "근거 문서 + 단계별 안내"를 한 번에 보여 주기 위해서다.
  // GPT 가 꺼져 있거나 실패하면 예전처럼 카드만 보여 준다.
  let matches: DocMatch[] = [];
  if ((local.kind === "no_data" || local.kind === "unsupported") && typeof searchFn === "function") {
    try {
      const result = await searchFn(message);
      if (result && result.ok && result.matches.length > 0) matches = result.matches;
    } catch {
      // 문서 검색 실패는 조용히 넘기고 아래로 계속 진행한다
    }
  }
  const docsForAi = matches.slice(0, 5).map((m) => ({
    title: m.title, docType: m.docType, branch: m.branch, field: m.field, snippet: m.snippet,
  }));
  const cardsOnly = (): DdasomiReply => ({
    text: `관련 문서를 ${matches.length}건 찾았어요. 아래에서 열어 보세요.`,
    kind: "documents",
    matches,
  });

  let aiFailReason: "disabled" | "error" = "error";
  if (typeof askFn === "function") {
    try {
      const result = await askFn(message, snapshot, docsForAi.length ? { docs: docsForAi } : undefined);
      if (result && result.ok && typeof result.answer === "string" && result.answer.trim()) {
        return { text: result.answer.trim(), kind: "answer", matches: matches.length ? matches : undefined };
      }
      if (result && result.ok === false) aiFailReason = result.reason;
    } catch {
      // 아래 로컬 대체로 진행
    }
  } else {
    aiFailReason = "disabled";
  }

  // GPT 없이도 문서는 찾았다면 카드만이라도 보여 준다.
  if (matches.length) return cardsOnly();

  // GPT를 못 썼거나 실패한 경우: 로컬 규칙이 답을 알면 그걸 쓰고, 로컬도 모르면 이유를 정직하게 보인다.
  // no_data 는 원래의 로컬 안내문("업로드 분석에서...")으로 돌아간다 — GPT 없이도 틀린 말은 하지 않는다.
  if (local.kind === "unsupported" || local.kind === "no_data") {
    if (crossModule) {
      return { text: aiFailReason === "disabled" ? AI_DISABLED_TEXT : AI_ERROR_TEXT, kind: "error" };
    }
    if (local.kind === "no_data") {
      return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
    }
    return { text: APOLOGY_TEXT, kind: "error" };
  }
  return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
}
