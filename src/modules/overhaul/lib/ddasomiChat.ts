// 따소미 챗봇 응답 결정 로직 — UI(ChatbotDock 등)의 상태 관리에서 분리해 순수 함수로 테스트 가능하게 유지한다.
//
// 원본: AI-Do-Sample/src/lib/ddasomiChat.js (그대로)
import { answerQuestion, type AnswerKind } from "./chatbotRules";
import { toDdasomiText } from "./ddasomiVoice";
import type { ChatbotSnapshot } from "./chatbotSnapshot";
import type { AskFn } from "./chatbotAI";

const APOLOGY_TEXT = "잠시 문제가 생겼어요. 공정 데이터를 다시 확인해볼게요.";

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
  if (local.kind === "refused" || local.kind === "no_data") {
    return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
  }

  if (typeof askFn === "function") {
    try {
      const result = await askFn(message, snapshot);
      if (result && result.ok && typeof result.answer === "string" && result.answer.trim()) {
        return { text: result.answer.trim(), kind: "answer" };
      }
    } catch {
      // 아래 로컬 대체로 진행
    }
  }

  // GPT를 못 썼거나 실패한 경우: 로컬 규칙이 답을 알면 그걸 쓰고, 로컬도 모르면(unsupported) 그때만 사과 문구를 보인다.
  if (local.kind === "unsupported") {
    return { text: APOLOGY_TEXT, kind: "error" };
  }
  return { text: toDdasomiText(local), kind: local.kind, suggestions: local.suggestions };
}
