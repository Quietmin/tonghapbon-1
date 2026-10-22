"use client";

/**
 * 보관함 문서 "수정" — 완성 PDF 와 별개로, 다시 작성 화면에 채워 넣을 수 있는
 * 원본 입력값(사진 파일 + 모든 칸의 값)을 저장·복원한다.
 *
 * PDF(archive.ts 의 DOCGEN_BUCKET/DOCGEN_TABLE)는 그림이라 한 번 찍으면 되돌릴
 * 수 없다. 그래서 요청대로 완전히 별개의 버킷(DOCGEN_SOURCE_BUCKET)·테이블
 * (DOCGEN_SOURCE_TABLE)에 원본을 따로 둔다. supabase/docgen/03-docgen-sources.sql
 * 을 실행해야 동작한다 — 실행 전에는 save 쪽만 조용히 실패하고(PDF 저장은
 * 그대로 되게 DocEditor 가 감싼다), load 쪽은 애초에 [수정] 버튼이 없어 호출될
 * 일이 없다(그 버튼은 source_id 가 있는 행에만 뜬다).
 *
 * 수정은 "새 버전으로 쌓기"다 — UPDATE/DELETE 권한이 전혀 필요 없다. 매번 새
 * 행(새 id)을 추가하고, 같은 문서의 이력은 lineage_id 로만 묶는다. 기존 버전은
 * 그대로 남아 언제든 다시 열어볼 수 있다.
 *
 * items 의 모양은 draft.ts 의 DraftItem 과 의도적으로 같다 — "불러온 뒤 File 로
 * 되살려 editor 상태에 채워 넣는다"는 복원 절차 자체가 임시저장 복원과 똑같기
 * 때문이다. DocEditor 쪽에서 두 경로가 거의 같은 코드를 쓸 수 있다.
 */
import type { DocMode } from "./constants";
import { isTextItem, type DocItem, type Stroke } from "./types";
import { DOCGEN_SOURCE_BUCKET, DOCGEN_SOURCE_TABLE, getDocgenSupabase } from "./supabase";
import type { DraftItem } from "./draft";

/** Storage 에 올릴 때 쓸 확장자. 파일명에 있으면 그걸, 없으면 MIME 타입에서 뽑는다 */
function extFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/")[1];
  return fromType && /^[a-z0-9]+$/i.test(fromType) ? fromType.toLowerCase() : "bin";
}

export interface SaveSourceInput {
  mode: DocMode;
  fileName: string;
  title: string;
  author: string;
  /** DocEditor 가 draft 에 쓰는 것과 같은 meta — saveMeta + draftExtra */
  meta: Record<string, unknown>;
  items: DocItem[];
  /** 보관함에서 불러와 고치는 중이면 그 버전 정보 — 새로 쓰는 거면 생략 */
  editingFrom?: { id: string; lineageId: string };
}

export interface SavedSource {
  id: string;
  lineageId: string;
}

/**
 * 사진들을 `{source id}/{item id}.{확장자}` 경로로 올리고, 입력값 전체를 새
 * 행으로 저장한다. editingFrom 이 있으면 그 lineage_id 를 물려받고 revises 에
 * 이전 버전 id 를 남긴다 — 없으면 새 lineage(= 새 문서)로 시작한다.
 *
 * 실패하면 이미 올라간 사진들을 치운다(archive.ts 의 saveToArchive 와 같은 원칙
 * — 행 없이 파일만 남는 고아를 만들지 않는다).
 */
export async function saveDocumentSource(input: SaveSourceInput): Promise<SavedSource> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  const id = crypto.randomUUID();
  const lineageId = input.editingFrom?.lineageId ?? crypto.randomUUID();
  const uploadedPaths: string[] = [];

  try {
    const items = await Promise.all(
      input.items.map(async (it) => {
        if (isTextItem(it)) {
          return { kind: "text" as const, id: it.id, body: it.body };
        }
        const path = `${id}/${it.id}.${extFor(it.file)}`;
        const { error } = await client.storage
          .from(DOCGEN_SOURCE_BUCKET)
          .upload(path, it.file, { contentType: it.file.type || undefined, upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        return {
          kind: "photo" as const,
          id: it.id,
          storage_path: path,
          width: it.width,
          height: it.height,
          strokes: it.strokes,
          desc: it.desc,
          rotation: it.rotation,
        };
      }),
    );

    const { error } = await client.from(DOCGEN_SOURCE_TABLE).insert({
      id,
      lineage_id: lineageId,
      revises: input.editingFrom?.id ?? null,
      doc_type: input.mode,
      file_name: input.fileName,
      title: input.title,
      author_name: input.author.trim() || null,
      meta: input.meta,
      items,
    });
    if (error) throw error;

    return { id, lineageId };
  } catch (e) {
    if (uploadedPaths.length > 0) {
      await client.storage.from(DOCGEN_SOURCE_BUCKET).remove(uploadedPaths).catch(() => {});
    }
    throw e;
  }
}

interface RawSourcePhotoItem {
  kind: "photo";
  id: string;
  storage_path: string;
  width: number;
  height: number;
  strokes: Stroke[];
  desc: string;
  rotation: number;
}
interface RawSourceTextItem {
  kind: "text";
  id: string;
  body: string;
}
type RawSourceItem = RawSourcePhotoItem | RawSourceTextItem;

export interface LoadedSource {
  id: string;
  lineageId: string;
  mode: DocMode;
  fileName: string;
  title: string;
  author: string;
  meta: Record<string, unknown>;
  items: DraftItem[];
}

/**
 * 행을 읽고, 사진들을 Storage 에서 내려받아 File 로 되살린다. DocEditor 의
 * 임시저장 복원(handleRestoreDraft)과 사실상 같은 모양의 결과를 돌려주므로,
 * 호출하는 쪽은 그 복원 로직을 거의 그대로 재사용할 수 있다.
 */
export async function loadDocumentSource(id: string): Promise<LoadedSource> {
  const client = getDocgenSupabase();
  if (!client) throw new Error("보관함이 설정되지 않았습니다.");

  const { data, error } = await client
    .from(DOCGEN_SOURCE_TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!data) throw new Error("문서를 찾지 못했습니다.");

  const rawItems = (data.items ?? []) as RawSourceItem[];
  const items: DraftItem[] = await Promise.all(
    rawItems.map(async (it): Promise<DraftItem> => {
      if (it.kind === "text") return { kind: "text", id: it.id, body: it.body };

      const { data: blob, error: dlError } = await client.storage
        .from(DOCGEN_SOURCE_BUCKET)
        .download(it.storage_path);
      if (dlError || !blob) {
        throw dlError ?? new Error(`사진을 불러오지 못했습니다: ${it.storage_path}`);
      }
      const name = it.storage_path.split("/").pop() ?? `${it.id}.jpg`;
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });

      return {
        kind: "photo",
        id: it.id,
        file,
        width: it.width,
        height: it.height,
        strokes: it.strokes ?? [],
        desc: it.desc ?? "",
        rotation: it.rotation ?? 0,
      };
    }),
  );

  return {
    id: data.id as string,
    lineageId: data.lineage_id as string,
    mode: data.doc_type as DocMode,
    fileName: data.file_name as string,
    title: data.title as string,
    author: (data.author_name as string | null) ?? "",
    meta: (data.meta ?? {}) as Record<string, unknown>,
    items,
  };
}
