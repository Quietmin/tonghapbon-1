/**
 * OpenAI 임베딩 호출 — docgen 문서 색인·검색 라우트가 공유한다.
 * 오버홀 챗봇(api/overhaul/chatbot)과 같은 OPENAI_API_KEY를 쓰지만, 모델은
 * 임베딩 전용(text-embedding-3-small, 1536차원 — 04-docgen-search.sql의
 * vector(1536)과 반드시 맞아야 한다)이라 따로 둔다.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** 한 번에 embed 할 수 있는 입력 개수 상한 — OpenAI 쪽 제한보다 넉넉히 낮게 잡는다 */
const MAX_BATCH = 100;

/**
 * texts와 같은 길이·순서의 벡터 배열을 돌려준다. 비활성(키 없음)·실패 시 null —
 * 호출부가 "색인/검색을 건너뛴다"로 처리하게 한다(여기서 throw 하지 않는다).
 */
export async function embedTexts(texts: string[], apiKey: string): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  if (texts.length > MAX_BATCH) texts = texts.slice(0, MAX_BATCH);

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.data;
    if (!Array.isArray(items) || items.length !== texts.length) return null;
    // OpenAI가 index 순서를 보장하지만, 혹시 섞여 오더라도 index로 맞춰 둔다
    const vectors = new Array<number[]>(texts.length);
    for (const it of items) {
      if (typeof it?.index !== "number" || !Array.isArray(it?.embedding)) return null;
      vectors[it.index] = it.embedding;
    }
    return vectors;
  } catch {
    return null;
  }
}

export async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  const vectors = await embedTexts([text], apiKey);
  return vectors?.[0] ?? null;
}
