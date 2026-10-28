"use client";

/**
 * /api/docgen/index, /api/docgen/search 를 부르는 브라우저용 얇은 래퍼.
 * 두 라우트 모두 비활성(킬스위치 꺼짐)이면 { ok:false } 를 주므로, 여기서는
 * 성공/실패를 그대로 전달하고 판단은 호출부에 맡긴다.
 */
import type { DocMode } from "./constants";
import type { DocMatch } from "@/app/api/docgen/search/route";

export type { DocMatch };

/**
 * 보관함 저장 직후 "쏘고 잊는다" — 색인 성패가 저장 흐름을 막으면 안 되므로
 * 호출부는 이 Promise를 기다리지 않는다(실패해도 콘솔에만 남긴다).
 */
export function indexDocumentFireAndForget(input: { documentId: string; sourceId: string; docType: DocMode }): void {
  fetch("/api/docgen/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch((e) => {
    console.error("[docgenSearch] 색인 요청 실패(저장 자체는 끝났으므로 무시):", e);
  });
}

export async function searchDocgenDocuments(
  query: string,
  docType?: DocMode,
): Promise<{ ok: true; matches: DocMatch[] } | null> {
  try {
    const res = await fetch("/api/docgen/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, docType }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}
