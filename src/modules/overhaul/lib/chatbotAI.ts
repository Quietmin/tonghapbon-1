// 자유 질문 해석/답변을 위한 GPT 호출 — 브라우저는 API 키를 절대 갖지 않고 /api/overhaul/chatbot/* 만 호출한다.
// 실패(비활성/네트워크 오류/타임아웃/서버 거부) 시 항상 null을 반환 — 호출부(chatbotRules.answerQuestionWithAI,
// ddasomiChat.getDdasomiReply)가 그대로 로컬 규칙 기반 응답으로 대체하도록 설계되어 있다.
// 여기서 숫자를 계산하거나 문장을 만들지 않는다.
//
// 원본: AI-Do-Sample/src/lib/chatbotAI.js
// 이 앱은 이 저장소 전체가 인증 없이 동작하도록 설계되어 있어(README 참고), 원본의
// VITE_APP_TOKEN(브라우저 번들에 노출되는 경량 남용방지 토큰)은 포팅하지 않았다 — 같은 오리진의
// Next Route Handler를 호출하고, 서버 쪽 GPT_CHAT_ENABLED/OPENAI_API_KEY 킬스위치로만 활성화를 통제한다.
import type { ChatbotSnapshot } from "./chatbotSnapshot";
import type { Classification } from "./chatbotRules";

export type AskFn = (
  message: string,
  context: ChatbotSnapshot,
  opts?: { timeoutMs?: number },
) => Promise<{ ok: true; answer: string } | null>;

export async function classifyQuestionWithAI(
  question: string,
  equipmentNames: string[],
  { timeoutMs = 6000 }: { timeoutMs?: number } = {},
): Promise<Classification | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/overhaul/chatbot/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, equipment: equipmentNames }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    return data.classification;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 따소미의 실제 답변을 GPT로 받아온다 — /api/overhaul/chatbot에 (질문, 검증된 요약 데이터)만 보낸다.
export const askDdasomi: AskFn = async (message, context, { timeoutMs = 10000 } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/overhaul/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
