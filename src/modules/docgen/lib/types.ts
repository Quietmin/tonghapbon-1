import type { DocMode } from "./constants";

/**
 * 사진 위에 그린 표시 하나. 원본(legacy Photo-Report) sketchStrokes 항목과 동일한 모양.
 * 좌표·굵기를 이미지 박스 기준 0~1 로 정규화해 둔다 — 자르기·회전으로 이미지 크기가
 * 바뀌어도(픽셀 자체가 아니라 비율로 저장했으니) 다시 계산할 필요 없이 그대로 맞는다.
 */
export interface Stroke {
  tool: "pen" | "highlighter" | "rect" | "ellipse" | "line";
  color: string;
  /** 이미지 너비 대비 비율 (예: 0.005 = 너비의 0.5%) */
  width: number;
  /** 0~1 로 정규화된 좌표. pen/highlighter 는 여러 점, 도형은 시작·끝 2점만 쓴다 */
  points: { x: number; y: number }[];
}

/** 편집 중인 사진 1장 — 원본의 items 배열 한 칸에 대응 */
export interface PhotoItem {
  /** React key 용 — 순서를 바꿔도 유지되어야 하므로 index 를 쓰지 않는다 */
  id: string;
  /** 원본 파일 (PDF 출력 시 다시 그린다) */
  file: File;
  /**
   * 현재 기준 이미지의 object URL — 자르기를 적용하면 이 URL 자체가 잘라낸 결과로
   * 교체된다(원본과 동일: 자르기는 되돌릴 수 없이 기준 이미지를 바꾼다).
   * 마킹(strokes)은 여기 얹지 않는다 — 화면 표시용 합성은 previewUrl 이 담당한다.
   */
  url: string;
  /** 위 url 에 담긴 이미지의 실제 픽셀 크기. strokes 좌표 정규화·자르기 계산에 쓴다 */
  width: number;
  height: number;
  /** 펜·형광펜·도형으로 그린 표시들. 편집기를 다시 열면 이어서 그릴 수 있도록 유지한다 */
  strokes: Stroke[];
  /**
   * url + strokes 를 합성한 표시용 이미지. DocEditor 가 관리하며, strokes 가 없으면
   * url 과 같다. 목록 썸네일·A4 미리보기 모두 이걸 우선 쓴다(있으면).
   */
  previewUrl: string | null;
  /** 사진 아래 설명. 여러 줄 허용 */
  desc: string;
  /** 90도 단위 회전 (0 / 90 / 180 / 270) — 화면에는 CSS transform 으로만 반영, 편집기를 열 때 실제 픽셀에 구워 넣는다 */
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
