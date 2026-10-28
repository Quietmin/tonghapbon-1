// 따소미 챗봇 응답 결정 로직 — DdasomiChatbot.tsx의 상태 관리에서 분리해 순수 함수로 테스트 가능하게 유지한다.
//
// 원본: AI-Do-Sample/src/lib/ddasomiChat.js (그대로)
import { answerQuestion, isCrossModuleQuestion, type AnswerKind } from "./chatbotRules";
import { toDdasomiText } from "./ddasomiVoice";
import type { ChatbotSnapshot } from "./chatbotSnapshot";
import type { AskFn } from "./chatbotAI";

const APOLOGY_TEXT = "잠시 문제가 생겼어요. 공정 데이터를 다시 확인해볼게요.";
// 고장이력·매뉴얼 등 다른 모듈 조회는 서버 GPT만 할 수 있다 — 꺼져 있으면 꺼져 있다고 정확히 알린다.
const AI_DISABLED_TEXT =
  "고장이력·매뉴얼·설비 검색은 AI 연결이 필요한데, 아직 서버에 AI 설정이 되어 있지 않아요. 관리자가 배포 환경변수(OPENAI_API_KEY)를 설정하면 바로 쓸 수 있어요.";
const AI_ERROR_TEXT = "조회 중에 연결이 잠시 불안정했어요. 조금 뒤에 다시 물어봐 주세요.";

export interface DdasomiReply {
  text: string;
  kind: AnswerKind | "error";
  suggestions?: string[];
}

/**
 * message + snapshot(getChatbotSnapshot 결과) → 화면에 표시할 DdasomiReply
 *
 * askFn(message, snapshot) => Promise<{ ok:true, answer:string } | null> — 보통 chatbotAI.askDdasomi.
 * askFn이 없거나 실패(null)해도 항상 안전하게 로컬 규칙(answerQuestion) 응답으로 대체된다.
 *
 * 실적 수정/삭제 요청이나 데이터 없음 안내는 GPT에 보내지 않고 즉시 처리한다 — GPT는 실제로 아무 것도
 * 수행할 수 없으므로, 이런 요청을 보내면 "삭제했다"처럼 실제로 하지 않은 일을 한 것처럼 답할 위험이 있다.
 */
export async function getDdasomiReply(message: string, snapshot: ChatbotSnapshot, askFn?: AskFn): Promise<DdasomiReply> {
  const local = answerQuestion(message, snapshot);
  // 고장이력·매뉴얼·현황 등은 로컬 규칙이 못 본다 — "공정 데이터 없음" 단락에 걸리지 않고 GPT로 보낸다.
  const crossModule = isCrossModuleQuestion(message);
  if (local.kind === "refused" || (local.kind === "no_data" && !crossModule)) {
    return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
  }

  let aiFailReason: "disabled" | "error" = "error";
  if (typeof askFn === "function") {
    try {
      const result = await askFn(message, snapshot);
      if (result && result.ok && typeof result.answer === "string" && result.answer.trim()) {
        return { text: result.answer.trim(), kind: "answer" };
      }
      if (result && result.ok === false) aiFailReason = result.reason;
    } catch {
      // 아래 로컬 대체로 진행
    }
  } else {
    aiFailReason = "disabled";
  }

  // GPT를 못 썼거나 실패한 경우: 로컬 규칙이 답을 알면 그걸 쓰고, 로컬도 모르면 이유를 정직하게 보인다.
  // (no_data가 여기까지 온 것은 crossModule로 우회한 경우뿐이다 — 위에서 이미 반환했다.)
  if (local.kind === "unsupported" || local.kind === "no_data") {
    if (crossModule) {
      return { text: aiFailReason === "disabled" ? AI_DISABLED_TEXT : AI_ERROR_TEXT, kind: "error" };
    }
    return { text: APOLOGY_TEXT, kind: "error" };
  }
  return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
}
