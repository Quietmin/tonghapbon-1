// 따소미 챗봇이 쓸 OpenAI 모델·추론 강도 — 답변 라우트(api/overhaul/chatbot)가 읽는다.
//
// 기본값은 2026-11-03 비교 평가로 골랐다(scripts/chatbot-eval.mjs, 결과는 README 챗봇 절):
// gpt-6.1-terra · medium — high 는 같은 답에 더 느리고 비쌌고, gpt-6-luna 는 싸지만 느리고 조회를 놓친 적이 있다.
// 환경변수가 없거나 빈칸이어도 이 기본값이 적용된다.
//
//   OPENAI_CHAT_MODEL      모델 이름 (예: gpt-6.1-terra, gpt-6-luna). 예전 이름 OPENAI_MODEL 도 받는다
//   OPENAI_CHAT_REASONING  none | low | medium | high | xhigh | max
//
// 받아쓰기(api/voice)는 OPENAI_VOICE_* 를 따로 쓴다 — 여기 값을 바꿔도 음성 입력에는 영향이 없다.

export type ChatReasoning = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export const DEFAULT_CHAT_MODEL = "gpt-6.1-terra";
export const DEFAULT_CHAT_REASONING: ChatReasoning = "medium";

const REASONING_VALUES: ChatReasoning[] = ["none", "low", "medium", "high", "xhigh", "max"];

/** 추론(reasoning) 파라미터를 받는 모델인지 — gpt-4.x 에 보내면 400 으로 거절된다 */
export function supportsReasoning(model: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/i.test(model);
}

export function parseReasoning(v: string | undefined | null): ChatReasoning | null {
  const t = (v ?? "").trim().toLowerCase();
  return (REASONING_VALUES as string[]).includes(t) ? (t as ChatReasoning) : null;
}

export function chatModelConfig(env: Record<string, string | undefined> = process.env): {
  model: string;
  reasoning: ChatReasoning;
} {
  return {
    model: (env.OPENAI_CHAT_MODEL ?? "").trim() || (env.OPENAI_MODEL ?? "").trim() || DEFAULT_CHAT_MODEL,
    reasoning: parseReasoning(env.OPENAI_CHAT_REASONING) ?? DEFAULT_CHAT_REASONING,
  };
}
