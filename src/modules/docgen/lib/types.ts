import type { DocMode } from "./constants";

/** 편집 중인 사진 1장 — 원본의 items 배열 한 칸에 대응 */
export interface PhotoItem {
  /** React key 용 — 순서를 바꿔도 유지되어야 하므로 index 를 쓰지 않는다 */
  id: string;
  /** 원본 파일 (PDF 출력 시 다시 그린다) */
  file: File;
  /** 미리보기용 object URL — 해제 책임은 만든 쪽에 있다 */
  url: string;
  /** 사진 아래 설명. 여러 줄 허용 */
  desc: string;
  /** 90도 단위 회전 (0 / 90 / 180 / 270) */
  rotation: number;
}

/**
 * 사진 대신 텍스트만 들어가는 칸.
 * 원본의 "매뉴얼에 텍스트 칸 추가"(커밋 2fa4cc7)에 대응 — 매뉴얼 모드에서만 쓴다.
 */
export interface TextItem {
  id: string;
  kind: "text";
  body: string;
}

export type DocItem = PhotoItem | TextItem;

export function isTextItem(item: DocItem): item is TextItem {
  return "kind" in item && item.kind === "text";
}

/** 모드별 머리말 필드 — Supabase documents 테이블 컬럼과 이름을 맞춘다 */
export interface DocMeta {
  mode: DocMode;
  /** 파일명(= PDF 파일명, 보관함 title) */
  fileName: string;

  /** 매뉴얼 전용 */
  manualType?: string;
  revision?: string;

  /** 매뉴얼·고장 보고서 공용 */
  field?: string;
  branch?: string;

  /** 고장 보고서 전용 */
  occurredAt?: string;
  facility?: string;
  device?: string;
  faultContent?: string;
  situation?: string;
  cause?: string;
  recoverAt?: string;
  recoverNote?: string;
  actionTaken?: string;
  outageNone?: boolean;
  outageApt?: number;
  outageBldg?: number;
  outageAt?: string;
  outageMins?: number;
}
