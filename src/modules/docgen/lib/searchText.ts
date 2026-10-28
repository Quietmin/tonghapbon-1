/**
 * 챗봇 문서 검색용 — 보관함 "수정 가능한 원본"(docgen_document_sources 의
 * meta/items)에서 임베딩으로 색인할 텍스트 조각을 뽑아낸다.
 *
 * PDF 는 그림이라 기계가 못 읽지만, 이 meta/items 는 작성 화면에 입력한 원문
 * 그대로다(사진 설명란 포함) — 그래서 PDF 를 다시 열어 텍스트를 추출할 필요가
 * 없다. 서버 전용은 아니다(순수 함수라 클라이언트에서도 import 가능하지만,
 * 실제로는 /api/docgen/index 라우트에서만 쓴다 — "use client" 를 달지 않은
 * 이유는 그래서다).
 */
import type { DocMode } from "./constants";

export interface SearchChunk {
  /** 어느 항목에서 나왔는지 — 검색 결과 스니펫에 보여줄 때 쓴다 */
  label: string;
  text: string;
}

/** 한 조각이 너무 길면 문장 경계에서 나눈다. 짧으면(대부분) 그대로 한 조각 */
const MAX_CHUNK_LEN = 600;

function splitLong(label: string, text: string): SearchChunk[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHUNK_LEN) return [{ label, text: trimmed }];

  const out: SearchChunk[] = [];
  let rest = trimmed;
  let part = 1;
  while (rest.length > 0) {
    if (rest.length <= MAX_CHUNK_LEN) {
      out.push({ label: `${label} (${part})`, text: rest });
      break;
    }
    // 문장 끝(.!?。) 근처에서 자르되, 못 찾으면 그냥 길이로 자른다
    let cut = rest.lastIndexOf(".", MAX_CHUNK_LEN);
    if (cut < MAX_CHUNK_LEN * 0.5) cut = MAX_CHUNK_LEN;
    out.push({ label: `${label} (${part})`, text: rest.slice(0, cut + 1).trim() });
    rest = rest.slice(cut + 1);
    part += 1;
  }
  return out;
}

/** 공백/자리글씨 수준의 텍스트는 임베딩할 가치가 없다 */
function isMeaningful(text: string | null | undefined): text is string {
  return typeof text === "string" && text.trim().length >= 2;
}

function fromField(label: string, value: unknown, skip?: boolean): SearchChunk[] {
  if (skip) return [];
  if (!isMeaningful(value as string)) return [];
  return splitLong(label, value as string);
}

interface RawItemLike {
  kind?: "text" | "photo";
  desc?: unknown;
  body?: unknown;
}

function fromItems(items: unknown): SearchChunk[] {
  if (!Array.isArray(items)) return [];
  const out: SearchChunk[] = [];
  items.forEach((raw, i) => {
    const it = raw as RawItemLike;
    const no = i + 1;
    if (it.kind === "text" && isMeaningful(it.body as string)) {
      out.push(...splitLong(`텍스트 칸 ${no}`, it.body as string));
    } else if (isMeaningful(it.desc as string)) {
      out.push(...splitLong(`사진 ${no} 설명`, it.desc as string));
    }
  });
  return out;
}

/**
 * 최대 조각 수 — 비용·저장량을 안전하게 묶어 둔다. 사진 30장 + 텍스트 칸까지
 * 다 채워도 이 안에서 끝나는 게 보통이라, 실제로 잘릴 일은 드물다.
 */
const MAX_CHUNKS = 60;

/**
 * docType + meta(saveMeta·draftExtra) + items(RawSourceItem[]) → 임베딩할 조각들.
 * 빈 문서(조각이 하나도 없으면) 빈 배열을 돌려준다 — 호출부는 그러면 색인을
 * 건너뛴다.
 */
export function buildSearchChunks(
  docType: DocMode,
  meta: Record<string, unknown>,
  items: unknown,
): SearchChunk[] {
  const chunks: SearchChunk[] = [];

  if (docType === "manual") {
    const sections = (meta.sections ?? {}) as Record<string, unknown>;
    const skip = (sections.skip ?? {}) as Record<string, unknown>;
    chunks.push(...fromField("목적", sections.purpose, skip.purpose === true));
    chunks.push(...fromField("준비물", sections.prep, skip.prep === true));
    chunks.push(...fromField("주의 사항", sections.caution, skip.caution === true));
  } else if (docType === "fault") {
    chunks.push(...fromField("설비명", meta.facility));
    chunks.push(...fromField("기기명(고장위치)", meta.device));
    chunks.push(...fromField("고장내용(추정 원인)", meta.fault_content));
    const situation = meta.situation;
    if (situation !== "생략") chunks.push(...fromField("상황", situation));
    const action = meta.action_taken;
    if (action !== "생략") chunks.push(...fromField("조치사항", action));
  }

  chunks.push(...fromItems(items));

  return chunks.slice(0, MAX_CHUNKS);
}
