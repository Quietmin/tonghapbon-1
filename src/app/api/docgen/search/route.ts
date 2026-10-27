// 챗봇이 "매뉴얼/고장보고서 내용을 찾아줘" 류의 질문을 받으면 이 라우트를 호출한다.
// 질문을 임베딩해서 docgen_document_chunks(04-docgen-search.sql)에서 가장 가까운
// 조각들을 찾고, 같은 문서(document_id)끼리 묶어 "문서 카드" 목록으로 돌려준다.
//
// 숫자(공정률 등)를 다루는 /api/overhaul/chatbot 와는 완전히 별개 라우트다 —
// 저쪽은 숫자 요약을 문장으로 풀어주고, 이쪽은 보관함 문서를 찾아준다.
import { NextResponse } from "next/server";
import { embedText } from "@/modules/docgen/lib/embeddings";
import type { DocMode } from "@/modules/docgen/lib/constants";
import { DOCGEN_TABLE, getDocgenSupabaseServer, isDocgenSupabaseConfiguredServer } from "@/modules/docgen/lib/supabaseServer";

export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 200;
const MAX_BODY_BYTES = 2 * 1024;
const DOC_TYPES: DocMode[] = ["report", "manual", "fault"];
// 조각 단위로는 넉넉히 가져와 문서 단위로 묶는다(한 문서에서 여러 조각이 맞을 수 있다)
const CHUNK_MATCH_COUNT = 24;
const MAX_DOCUMENTS = 5;
// 코사인 유사도 하한 — 이보다 낮으면 "관련 없음"으로 보고 버린다. text-embedding-3-small로
// 실제 매뉴얼/고장보고서 텍스트를 써 본 경험적 값이 아직 없어 보수적으로 잡았다.
// 엉뚱한 결과가 자주 섞이면 이 값을 올리고, 반대로 못 찾는 게 많으면 내린다.
const SIMILARITY_FLOOR = 0.25;

export interface DocMatch {
  id: string;
  title: string;
  docType: DocMode;
  branch: string | null;
  field: string | null;
  createdAt: string;
  /** docgen-documents 버킷 안 경로 — 미리보기 열 때 getSignedUrl(pdfPath)로 서명 URL을 만든다 */
  pdfPath: string;
  snippet: string;
  similarity: number;
}

function fail(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  if (process.env.GPT_CHAT_ENABLED !== "true") return fail(200, "disabled");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(200, "disabled");
  if (!isDocgenSupabaseConfiguredServer()) return fail(200, "disabled");

  const rawLen = Number(req.headers.get("content-length") || 0);
  if (rawLen > MAX_BODY_BYTES) return fail(413, "invalid_request");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_request");
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query || query.length > MAX_QUERY_LEN) return fail(400, "invalid_request");
  const docType = DOC_TYPES.includes(body?.docType) ? (body.docType as DocMode) : null;

  const client = getDocgenSupabaseServer();
  if (!client) return fail(200, "disabled");

  const embedding = await embedText(query, apiKey);
  if (!embedding) return fail(200, "upstream_error");

  const { data: chunkRows, error: rpcError } = await client.rpc("match_docgen_chunks", {
    query_embedding: embedding,
    match_count: CHUNK_MATCH_COUNT,
    filter_doc_type: docType,
  });
  if (rpcError) {
    console.error("[api/docgen/search] match_docgen_chunks 실패:", rpcError.message);
    return fail(200, "upstream_error");
  }

  type ChunkRow = { document_id: string; label: string; chunk_text: string; similarity: number };
  const rows = ((chunkRows ?? []) as ChunkRow[]).filter((r) => r.similarity >= SIMILARITY_FLOOR);

  // 문서 단위로 묶는다 — 조각은 similarity 내림차순으로 오므로, 문서마다 처음 만나는
  // (= 그 문서에서 가장 비슷한) 조각을 대표 스니펫으로 쓴다.
  const byDocument = new Map<string, { similarity: number; snippet: string }>();
  for (const r of rows) {
    if (!byDocument.has(r.document_id)) {
      byDocument.set(r.document_id, { similarity: r.similarity, snippet: r.chunk_text });
    }
    if (byDocument.size >= MAX_DOCUMENTS) break;
  }

  if (byDocument.size === 0) return NextResponse.json({ ok: true, matches: [] });

  const ids = Array.from(byDocument.keys());
  const { data: docs, error: docsError } = await client
    .from(DOCGEN_TABLE)
    .select("id, title, doc_type, branch, field, created_at, pdf_path")
    .in("id", ids);
  if (docsError) {
    console.error("[api/docgen/search] 문서 조회 실패:", docsError.message);
    return fail(200, "upstream_error");
  }

  const matches: DocMatch[] = (docs ?? [])
    .map((d): DocMatch => {
      const hit = byDocument.get(d.id as string)!;
      return {
        id: d.id as string,
        title: d.title as string,
        docType: d.doc_type as DocMode,
        branch: (d.branch as string | null) ?? null,
        field: (d.field as string | null) ?? null,
        createdAt: d.created_at as string,
        pdfPath: d.pdf_path as string,
        snippet: hit.snippet,
        similarity: hit.similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  return NextResponse.json({ ok: true, matches });
}
