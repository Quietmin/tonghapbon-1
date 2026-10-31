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

/** 보관함 검색 결과 중 GPT 에 근거로 넘길 최소 정보 — 서버가 다시 걸러서(sanitizeDocuments) 프롬프트에 넣는다 */
export interface AskDoc {
  title: string;
  docType: string;
  branch: string | null;
  field: string | null;
  snippet: string;
}

/**
 * 챗봇 AI 호출이 실패한 이유 — disabled(서버에 설정 없음) · auth(키 문제) · quota(사용 한도·결제) ·
 * rate(요청 과다, 잠시 뒤 재시도) · model(모델 이름 문제) · error(그 밖의 일시 오류)
 */
export type AskFailReason = "disabled" | "auth" | "quota" | "rate" | "model" | "error";

const FAIL_REASON_BY_SERVER: Record<string, AskFailReason> = {
  disabled: "disabled",
  upstream_auth: "auth",
  upstream_quota: "quota",
  upstream_rate: "rate",
  upstream_model: "model",
};

export type AskFn = (
  message: string,
  context: ChatbotSnapshot,
  opts?: { timeoutMs?: number; docs?: AskDoc[] },
) => Promise<
  | { ok: true; answer: string; /** 이 답이 조회한 지사 범위("청주지사" 또는 "전 지사") */ scope?: string }
  | { ok: false; reason: AskFailReason }
  | null
>;

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
// 서버가 고장이력·매뉴얼 등을 도구로 조회하는 동안 2~3회 왕복이 생길 수 있어 타임아웃을 넉넉히 잡는다.
// 실패를 둘로 구분해 돌려준다: "disabled"(서버에 GPT 설정이 없음 — 재시도 무의미)와
// "error"(일시 오류 — 재시도 가치 있음). 호출부(ddasomiChat)가 안내 문구를 다르게 쓴다.
export const askDdasomi: AskFn = async (message, context, { timeoutMs = 45000, docs } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/overhaul/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context, documents: docs?.slice(0, 5) }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: "error" };
    const data = await res.json();
    if (data?.ok === true && typeof data.answer === "string") return data;
    return { ok: false, reason: FAIL_REASON_BY_SERVER[data?.reason as string] ?? "error" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
