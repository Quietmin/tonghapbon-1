// 매뉴얼·고장보고서를 보관함에 저장한 직후, DocEditor가 이 라우트를 "쏘고 잊는다"
// (fire-and-forget) 방식으로 호출해 챗봇 검색용 임베딩을 만든다.
//
// 실패해도 조용히 넘어가도록 설계되어 있다 — 이 라우트가 실행될 때는 이미 PDF와
// 원본(docgen_document_sources)이 모두 저장된 뒤라, 색인 실패가 사용자의 저장
// 작업 자체를 막아서는 안 된다(DocEditor 쪽에서 await 하지 않고 호출한다).
//
// 킬스위치: 챗봇 GPT 기능과 같은 GPT_CHAT_ENABLED/OPENAI_API_KEY를 공유한다 —
// 임베딩도 결국 "AI 기능"이고, 두 기능을 따로 켜고 끌 이유가 아직은 없다.
import { NextResponse } from "next/server";
import { embedTexts } from "@/modules/docgen/lib/embeddings";
import { buildSearchChunks } from "@/modules/docgen/lib/searchText";
import type { DocMode } from "@/modules/docgen/lib/constants";
import {
  DOCGEN_CHUNK_TABLE,
  DOCGEN_SOURCE_TABLE,
  getDocgenSupabaseServer,
  isDocgenSupabaseConfiguredServer,
} from "@/modules/docgen/lib/supabaseServer";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;
const DOC_TYPES: DocMode[] = ["report", "manual", "fault"];
// Supabase uuid — 형식만 거칠게 확인한다(실제 존재 여부는 쿼리가 실패하면 자연히 드러난다)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
  const docType = body?.docType as DocMode;
  if (!UUID_RE.test(documentId) || !UUID_RE.test(sourceId) || !DOC_TYPES.includes(docType)) {
    return fail(400, "invalid_request");
  }

  const client = getDocgenSupabaseServer();
  if (!client) return fail(200, "disabled");

  const { data: source, error: sourceError } = await client
    .from(DOCGEN_SOURCE_TABLE)
    .select("meta, items")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) return fail(200, "not_found");

  const chunks = buildSearchChunks(docType, (source.meta ?? {}) as Record<string, unknown>, source.items);
  if (chunks.length === 0) return NextResponse.json({ ok: true, indexed: 0 });

  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    apiKey,
  );
  if (!vectors) return fail(200, "upstream_error");

  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    source_id: sourceId,
    doc_type: docType,
    label: c.label,
    chunk_text: c.text,
    embedding: vectors[i],
  }));

  const { error: insertError } = await client.from(DOCGEN_CHUNK_TABLE).insert(rows);
  if (insertError) {
    console.error("[api/docgen/index] 색인 저장 실패:", insertError.message);
    return fail(200, "upstream_error");
  }

  return NextResponse.json({ ok: true, indexed: rows.length });
}
