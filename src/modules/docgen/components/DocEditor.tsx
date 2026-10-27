"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, ScreenHeader, type Accent } from "@/shared/components/ui";
import {
  MAX_PHOTOS,
  MODE_LABELS,
  MODE_PLACEHOLDERS,
  MODE_TITLES,
  PHOTOS_PER_PAGE,
  type DocMode,
} from "../lib/constants";
import { fitFaultPageLayout, fitReportPageLayout } from "../lib/fitPageLayout";
import { composePreview, readImageFile } from "../lib/imageEdit";
import { isDocgenSupabaseConfigured } from "../lib/supabase";
import { saveToArchive, type SaveMeta } from "../lib/archive";
import { loadDocumentSource, saveDocumentSource } from "../lib/source";
import { isTextItem, type DocItem, type PhotoItem } from "../lib/types";
import {
  clearDraft,
  formatSavedAt,
  isDraftEnabled,
  loadDraft,
  peekDraft,
  saveDraft,
  type DraftMeta,
  type DraftPayload,
} from "../lib/draft";
import { exportPagesToPdf, renderPagesToBlob } from "../lib/pdf";
import { A4Page, FaultA4Page, chunkFaultPages, chunkPages } from "./A4Preview";
import { PageBanner } from "./Letterhead";
import PhotoEditorModal, { type PhotoEditorResult } from "./PhotoEditorModal";
import AutoTextarea from "./AutoTextarea";

/**
 * 3개 모드(사진대장·매뉴얼·고장 보고서)가 공유하는 편집기.
 * 원본(legacy Photo-Report)은 appMode 변수 하나로 한 화면에서 분기했다 —
 * 그 구조를 그대로 살려, 모드별로 다른 부분만 props 로 받는다.
 */
let seq = 0;
function nextId() {
  seq += 1;
  return `item-${seq}`;
}

/**
 * A4 쪽의 자연 크기(px). print.css 의 .a4-page 가 쓰는 210mm/297mm 와 같은 기준
 * (96dpi 가정 — 브라우저 CSS mm 단위의 고정 변환값). 미리보기를 칸 폭에 맞춰 줄일
 * 때, 줄어든 만큼 자리도 같이 줄이려면(안 그러면 밑에 빈 칸이 남는다) 이 자연
 * 크기를 알아야 한다.
 *
 * 높이는 min-height 라 모든 쪽이 항상 이 값 이상이다(fitPageLayout 이 내용을
 * 넘치지 않게 눌러 담으므로 실제로도 늘 이 값과 같다) — 쪽마다 실제 렌더된
 * 높이를 따로 재지 않아도 된다.
 */
const A4_WIDTH_PX = 210 * (96 / 25.4);
const A4_HEIGHT_PX = 297 * (96 / 25.4);

/** 수동 확대/축소 범위. 100% 는 이 A4_WIDTH_PX(실제 크기) 기준이다 — PDF 출력과 같은 잣대. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
function clampZoom(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
}

/** Gmail 작성 화면 주소 (원본 gmailComposeUrl 과 동일) */
function gmailComposeUrl(subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function mailBodyFor(pdfFileName: string): string {
  return (
    `PDF 파일(${pdfFileName})이 이 기기에 다운로드되었습니다.\n` +
    "Gmail 작성 화면 하단의 첨부파일 아이콘을 눌러 방금 다운로드된 파일을 직접 첨부해 주세요.\n" +
    "(브라우저 보안 정책상 외부 웹사이트가 Gmail 에 파일을 자동으로 첨부할 수는 없습니다.)"
  );
}

export interface DocEditorProps {
  mode: DocMode;
  /** 모드별 머리말 입력 UI (매뉴얼 종류·분야·지사, 고장 보고서 상세 등) */
  metaFields?: React.ReactNode;
  /** 매뉴얼 모드처럼 사진마다 순번을 매길지 */
  numbered?: boolean;
  /**
   * 출력물 맨 위 표제부. 페이지마다 다시 그린다 — 매뉴얼 표제부에 "페이지 n/N"과
   * 제목이 들어가므로 쪽 번호와 제목을 받아야 한다. 넘기지 않으면 모드 기본 머리를 쓴다.
   */
  renderLetterhead?: (pageNo: number, pageCount: number, title: string) => React.ReactNode;
  /** 고장 보고서 첫 장의 "1. 고장 요약" 표 */
  faultSummary?: React.ReactNode;
  /**
   * 머리말 칸 배치를 모드가 직접 정할 때 쓴다 (매뉴얼은 원본과 같이
   * 종류·분야·지사 → 파일명 → 작성자·개정번호 순으로 줄을 나눈다).
   * 넘기지 않으면 기본 2열 격자에 파일명·작성자·metaFields 를 차례로 넣는다.
   * 넘기면 metaFields 는 쓰이지 않는다 — 배치를 통째로 맡기는 것이기 때문이다.
   */
  renderMeta?: (parts: {
    fileNameField: React.ReactNode;
    /** 보관함이 설정돼 있지 않으면 null — 작성자는 보관함 표시용 값이라서 */
    authorField: React.ReactNode | null;
  }) => React.ReactNode;
  /** 머리말 아래에 붙는 모드 전용 입력 묶음 (매뉴얼의 1~4번 항목) */
  sections?: React.ReactNode;
  /** 사진대장·매뉴얼 첫 장에서 사진 격자 위에 들어가는 블록 */
  firstPageSummary?: React.ReactNode;
  /**
   * 제목 줄 오른쪽에 서는 것 — 같은 챕터의 조회 화면으로 건너가는 버튼.
   * 좁은 폭에서는 제목 아래로 내려가 가로폭을 다 쓴다(모바일 하단탭에는 작성·조회
   * 구분이 없어서, 이 버튼이 둘 사이를 오가는 유일한 길이다).
   */
  headingAction?: React.ReactNode;
  /** 챕터 색 (고장관리는 tertiary). 색 규칙은 ui.tsx 의 ACCENT_STYLE 참고 */
  accent?: Accent;
  /** 매뉴얼 모드에서 텍스트 전용 칸 추가를 허용할지 */
  allowTextItems?: boolean;
  /**
   * 보관함에 함께 저장할 모드별 메타.
   * 호출부(각 모드 page.tsx)가 자기 입력값을 documents 컬럼명으로 넘겨준다.
   */
  saveMeta?: Omit<SaveMeta, "doc_type" | "file_name" | "title" | "page_count" | "photo_count">;
  /**
   * 임시저장을 되살릴 때, 저장해 둔 머리말 값을 부모에게 돌려준다.
   * 지사·분야·발생일시 같은 값은 각 모드 컴포넌트가 들고 있어서 DocEditor 가
   * 직접 되돌릴 수 없다. 넘기지 않으면 머리말은 복원되지 않고 사진·설명만 살아난다.
   */
  onRestoreMeta?: (meta: Record<string, unknown>) => void;
  /**
   * 보관함 컬럼에는 없지만 임시저장에는 남아야 하는 값 (매뉴얼 1~4번 항목 본문 등).
   * saveMeta 에 넣으면 docgen_documents 에 없는 컬럼이라 저장 자체가 거부된다.
   * 임시저장할 때만 saveMeta 와 합쳐 넣고, 복구할 때 onRestoreMeta 로 함께 돌려준다.
   */
  draftExtra?: Record<string, unknown>;
}

export default function DocEditor({
  mode,
  metaFields,
  numbered = false,
  renderLetterhead,
  faultSummary,
  renderMeta,
  sections,
  firstPageSummary,
  headingAction,
  accent = "primary",
  allowTextItems = false,
  saveMeta,
  onRestoreMeta,
  draftExtra,
}: DocEditorProps) {
  const [fileName, setFileName] = useState("");
  const [author, setAuthor] = useState("");
  const [items, setItems] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 앨범 선택과 별개로 카메라를 바로 여는 입력. capture 를 같은 input 에 붙이면
  // 폰에서 앨범 선택이 막히므로 두 개로 나눈다 (현장에서 찍고 바로 붙일 때 씀).
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 미리보기를 칸 폭에 맞춰 줄이는 배율. 1 을 넘지 않는다(키우지는 않는다) —
  // 좁은 칸(2열 작성 화면의 오른쪽, 폰 화면)에서 원래 크기(794px)로 두면 가로
  // 스크롤을 해야만 쪽 전체를 볼 수 있어서, 통째로 줄여 한 번에 보이게 한다.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const cs = window.getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const available = el.clientWidth - padX;
      setPreviewScale(available > 0 ? Math.min(1, available / A4_WIDTH_PX) : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * 수동 확대/축소. null 이면 "칸 폭에 맞춤"(previewScale)을 그대로 쓴다 — 처음
   * 들어왔을 때나 아직 손대지 않았을 때의 기본값이다. 버튼이나 Ctrl+휠로 한 번
   * 건드리면 구체적인 배율로 고정되고, 창 크기가 바뀌어도(= previewScale 이
   * 바뀌어도) 사용자가 고른 배율을 그대로 유지한다 — 다시 자동으로 돌아가려면
   * 퍼센트 숫자를 눌러 null 로 되돌린다.
   */
  const [zoom, setZoom] = useState<number | null>(null);
  const baseScale = zoom ?? previewScale;

  function zoomIn() {
    setZoom(clampZoom(baseScale + ZOOM_STEP));
  }
  function zoomOut() {
    setZoom(clampZoom(baseScale - ZOOM_STEP));
  }
  function zoomReset() {
    setZoom(null);
  }

  // Ctrl+휠로 확대/축소 — 미리보기 위에 마우스가 있을 때만. 네이티브 리스너로 다는
  // 이유는 preventDefault 때문이다: 이걸 안 막으면 브라우저가 화면 전체를
  // 확대/축소해 버린다(트랙패드 두 손가락 오므리기도 브라우저에는 Ctrl+휠로 들어와
  // 같이 막힌다). Ctrl 없는 보통 휠은 그대로 둬 칸 안 세로 스크롤이 막히지 않게 한다.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((prev) => clampZoom((prev ?? previewScale) - e.deltaY * 0.001));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewScale]);

  // 두 손가락 오므리기/펴기로 확대·축소 — 모바일엔 Ctrl+휠이 없으니 핀치로 같은
  // zoom 상태를 조절한다. 두 손가락일 때만 preventDefault 해서, 한 손가락 스크롤
  // (칸 안 세로/가로 이동)과 브라우저 페이지 전체 핀치 줌은 그대로 건드리지 않는다.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDist = distance(e.touches);
      startZoom = zoom ?? previewScale;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist <= 0) return;
      e.preventDefault();
      setZoom(clampZoom(startZoom * (distance(e.touches) / startDist)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoom, previewScale]);

  const archiveEnabled = isDocgenSupabaseConfigured();
  const label = MODE_LABELS[mode];

  /** 이 종류로 저장해 둔 임시본이 있으면 그 요약 — 상단 안내줄에 쓴다 */
  const [draftMeta, setDraftMeta] = useState<DraftMeta | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  // saveMeta 는 부모가 렌더마다 새 객체로 넘긴다 — 의존성에 넣으면 무한 루프가 되므로
  // 최신 값만 ref 로 들고 있다가 저장할 때 읽는다.
  const saveMetaRef = useRef(saveMeta);
  saveMetaRef.current = saveMeta;
  const draftExtraRef = useRef(draftExtra);
  draftExtraRef.current = draftExtra;

  // 지금 고치고 있는 버전. null 이면 새 문서 — 다음 저장이 새 lineage 로 시작한다.
  // 값이 있으면 다음 저장이 이 lineage 를 물려받고 이 id 를 revises 로 남긴다.
  const [editingSource, setEditingSource] = useState<{ id: string; lineageId: string } | null>(
    null,
  );
  const [loadingSource, setLoadingSource] = useState(false);

  async function loadFromArchive(sourceId: string) {
    setLoadingSource(true);
    setError(null);
    try {
      const source = await loadDocumentSource(sourceId);
      // 저장해 둔 File 로 blob URL 을 다시 만든다 (handleRestoreDraft 와 같은 절차)
      const restored: DocItem[] = await Promise.all(
        source.items.map(async (it): Promise<DocItem> => {
          if (it.kind === "text") return { id: it.id, kind: "text", body: it.body };
          const { url, width, height } = await readImageFile(it.file);
          return {
            id: it.id,
            file: it.file,
            url,
            width: width || it.width,
            height: height || it.height,
            strokes: it.strokes ?? [],
            previewUrl: (it.strokes?.length ?? 0) > 0 ? null : url,
            desc: it.desc,
            rotation: it.rotation ?? 0,
          };
        }),
      );
      setFileName(source.fileName);
      setAuthor(source.author);
      setItems(restored);
      onRestoreMeta?.(source.meta);
      setEditingSource({ id: source.id, lineageId: source.lineageId });
      setNotice(
        `"${source.title}" 을(를) 불러왔습니다. 고친 뒤 출력하면 새 버전으로 보관함에 쌓입니다(이 버전은 그대로 남습니다).`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `문서를 불러오지 못했습니다: ${e.message}`
          : "문서를 불러오지 못했습니다.",
      );
    } finally {
      setLoadingSource(false);
    }
  }

  // 들어올 때 한 번만 확인한다. 이어서 쓸지는 사용자가 고른다 — 조용히 되살리면
  // 새 문서를 쓰려던 사람이 남의 내용 위에 덮어쓰게 된다.
  // ?edit= 으로 들어왔으면 그게 우선이다 — 임시저장 배너까지 같이 뜨면 뭘
  // 골라야 할지 헷갈린다.
  useEffect(() => {
    /*
     * 보관함 [수정] 으로 들어오면 주소에 ?edit=<source id> 가 붙는다
     * (ArchiveBrowser 참고). useSearchParams() 대신 여기서 직접 읽는 이유: 이
     * 페이지들은 정적으로 미리 그려지는데, useSearchParams() 를 쓰면 Suspense
     * 경계가 따로 필요해져 세 페이지(사진대장·매뉴얼·고장 보고서)를 전부 고쳐야
     * 한다. 렌더 중이 아니라 effect 안에서 읽으므로 서버 렌더와도 부딪히지 않는다.
     */
    const editSourceId = new URLSearchParams(window.location.search).get("edit");
    if (editSourceId) {
      void loadFromArchive(editSourceId);
      return;
    }
    if (!isDraftEnabled()) return;
    let cancelled = false;
    void peekDraft(mode).then((m) => {
      if (!cancelled) setDraftMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function handleSaveDraft() {
    if (!isDraftEnabled()) {
      setError("이 브라우저에서는 임시저장을 사용할 수 없습니다.");
      return;
    }
    setDraftBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: DraftPayload = {
        savedAt: new Date().toISOString(),
        mode,
        fileName,
        author,
        meta: {
          ...(saveMetaRef.current ?? {}),
          ...(draftExtraRef.current ?? {}),
        } as Record<string, unknown>,
        items: items.map((it) =>
          isTextItem(it)
            ? { kind: "text" as const, id: it.id, body: it.body }
            : {
                kind: "photo" as const,
                id: it.id,
                // blob URL 은 새로고침하면 죽는다 — 원본 File 을 그대로 넣는다
                file: it.file,
                width: it.width,
                height: it.height,
                strokes: it.strokes,
                desc: it.desc,
                rotation: it.rotation,
              },
        ),
      };
      await saveDraft(payload);
      setDraftMeta({
        savedAt: payload.savedAt,
        mode,
        fileName,
        photoCount: payload.items.filter((i) => i.kind === "photo").length,
      });
      setNotice("임시저장했습니다. 창을 닫아도 이어서 작성할 수 있습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "임시저장에 실패했습니다.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleRestoreDraft() {
    setDraftBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await loadDraft(mode);
      if (!payload) {
        setError("임시저장된 내용을 찾지 못했습니다.");
        setDraftMeta(null);
        return;
      }
      // 저장해 둔 File 로 blob URL 을 다시 만든다(예전 URL 은 이미 죽었다)
      const restored: DocItem[] = await Promise.all(
        payload.items.map(async (it): Promise<DocItem> => {
          if (it.kind === "text") return { id: it.id, kind: "text", body: it.body };
          const { url, width, height } = await readImageFile(it.file);
          return {
            id: it.id,
            file: it.file,
            url,
            // 저장 당시 크기가 아니라 방금 읽은 실제 크기를 믿는다
            width: width || it.width,
            height: height || it.height,
            strokes: it.strokes ?? [],
            // null 로 두면 재합성 이펙트가 마킹을 다시 구워 준다
            previewUrl: (it.strokes?.length ?? 0) > 0 ? null : url,
            desc: it.desc,
            rotation: it.rotation ?? 0,
          };
        }),
      );
      setFileName(payload.fileName ?? "");
      setAuthor(payload.author ?? "");
      setItems(restored);
      onRestoreMeta?.(payload.meta ?? {});
      setDraftMeta(null);
      setNotice("임시저장한 내용을 불러왔습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "임시저장을 불러오지 못했습니다.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleDiscardDraft() {
    if (!window.confirm("임시저장한 내용을 지울까요? 되돌릴 수 없습니다.")) return;
    await clearDraft(mode);
    setDraftMeta(null);
  }

  // object URL 은 브라우저가 자동으로 놓아주지 않는다 — 화면을 떠날 때 직접 해제한다.
  // previewUrl 은 url 과 별개의 blob 일 수 있다(마킹 합성본)— 있으면 그것도 같이 놓는다.
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (!isTextItem(it)) {
          URL.revokeObjectURL(it.url);
          if (it.previewUrl && it.previewUrl !== it.url) URL.revokeObjectURL(it.previewUrl);
        }
      });
    };
    // 언마운트 시 1회만 — items 를 의존성에 넣으면 편집 중에 URL 이 회수된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사진마다 실제 픽셀 크기를 알아야(자르기·마킹 좌표 정규화) 해서, 파일을 읽어
  // object URL 을 만드는 동안 잠깐 비동기로 기다린다(사진 선택 즉시 화면이 굳지 않음).
  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const photos = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (photos.length === 0) {
      setError("이미지 파일만 추가할 수 있습니다.");
      return;
    }

    Promise.all(
      photos.map((file) =>
        readImageFile(file).then(
          ({ url, width, height }): PhotoItem => ({
            id: nextId(),
            file,
            url,
            width,
            height,
            strokes: [],
            previewUrl: url,
            desc: "",
            rotation: 0,
          }),
        ),
      ),
    )
      .then((loaded) => {
        setItems((prev) => {
          const room = MAX_PHOTOS - prev.length;
          if (room <= 0) {
            setError(`사진은 최대 ${MAX_PHOTOS}장까지 넣을 수 있습니다.`);
            loaded.forEach((it) => URL.revokeObjectURL(it.url));
            return prev;
          }
          if (loaded.length > room) {
            setError(`최대 ${MAX_PHOTOS}장까지만 들어갑니다. ${room}장만 추가했습니다.`);
            loaded.slice(room).forEach((it) => URL.revokeObjectURL(it.url));
          }
          return [...prev, ...loaded.slice(0, room)];
        });
      })
      .catch(() => setError("사진을 불러오지 못했습니다. 다시 시도해 주세요."));
  }, []);

  /**
   * 사진 교체 — 설명·순서는 그대로 두고 그림만 바꾼다 (원본 replaceFileInput 대응).
   * 잘못 찍은 사진 한 장 때문에 지웠다 다시 넣으면 순번과 설명을 다시 맞춰야 한다.
   * 마킹(strokes)은 새 사진과 좌표가 맞지 않으므로 비운다.
   */
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);

  function pickReplacement(id: string) {
    replaceTargetIdRef.current = id;
    replaceFileInputRef.current?.click();
  }

  function handleReplaceFile(file: File | undefined) {
    const id = replaceTargetIdRef.current;
    replaceTargetIdRef.current = null;
    if (!id || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 넣을 수 있습니다.");
      return;
    }
    setError(null);
    readImageFile(file)
      .then(({ url, width, height }) => {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== id || isTextItem(it)) return it;
            // 예전 사진의 blob URL 은 여기서 놓아준다 — 안 놓으면 그대로 샌다
            URL.revokeObjectURL(it.url);
            if (it.previewUrl && it.previewUrl !== it.url) URL.revokeObjectURL(it.previewUrl);
            return {
              ...it,
              file,
              url,
              width,
              height,
              strokes: [],
              previewUrl: url,
              rotation: 0,
            };
          }),
        );
      })
      .catch(() => setError("사진을 불러오지 못했습니다. 다시 시도해 주세요."));
  }

  function updateDesc(id: string, desc: string) {
    setItems((prev) => prev.map((it) => (it.id === id && !("kind" in it) ? { ...it, desc } : it)));
  }

  function updateText(id: string, body: string) {
    setItems((prev) => prev.map((it) => (it.id === id && "kind" in it ? { ...it, body } : it)));
  }

  function rotate(id: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && !("kind" in it) ? { ...it, rotation: (it.rotation + 90) % 360 } : it,
      ),
    );
  }

  function remove(id: string) {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target && !isTextItem(target)) {
        URL.revokeObjectURL(target.url);
        if (target.previewUrl && target.previewUrl !== target.url) {
          URL.revokeObjectURL(target.previewUrl);
        }
      }
      return prev.filter((it) => it.id !== id);
    });
  }

  /** 편집기에서 [저장]을 누르면 기준 이미지(자르기 반영분)와 마킹을 통째로 교체한다 */
  function handleEditSave(id: string, result: PhotoEditorResult) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id || isTextItem(it)) return it;
        if (it.url !== result.url) URL.revokeObjectURL(it.url);
        if (it.previewUrl && it.previewUrl !== it.url && it.previewUrl !== result.url) {
          URL.revokeObjectURL(it.previewUrl);
        }
        return {
          ...it,
          url: result.url,
          width: result.width,
          height: result.height,
          strokes: result.strokes,
          rotation: 0,
          // previewUrl 을 비워 재합성 이펙트가 새로 만들게 한다
          previewUrl: null,
        };
      }),
    );
    setEditingId(null);
  }

  const editingPhoto = items.find(
    (it): it is PhotoItem => it.id === editingId && !isTextItem(it),
  );

  // url·strokes 가 바뀐(= previewUrl 이 비워진) 사진만 새로 합성한다. 마킹이 없으면
  // 굳이 캔버스를 돌리지 않고 url 을 그대로 previewUrl 로 채운다.
  useEffect(() => {
    const stale = items.filter(
      (it): it is PhotoItem => !isTextItem(it) && it.previewUrl === null,
    );
    if (stale.length === 0) return;

    let cancelled = false;
    Promise.all(
      stale.map(async (it) => {
        const previewUrl =
          it.strokes.length === 0 ? it.url : await composePreview(it.url, it.width, it.height, it.strokes);
        return { id: it.id, previewUrl };
      }),
    ).then((results) => {
      if (cancelled) return;
      setItems((prev) => {
        const byId = new Map(results.map((r) => [r.id, r.previewUrl]));
        return prev.map((it) =>
          !isTextItem(it) && byId.has(it.id) ? { ...it, previewUrl: byId.get(it.id)! } : it,
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  // 설명이 아무리 길어져도 페이지가 297mm 를 넘지 않도록, 렌더될 때마다 실제 DOM 을
  // 측정해서 사진·설명 칸 높이를 맞춘다. items(=사진·설명 내용) 가 바뀔 때마다 다시 잰다.
  useLayoutEffect(() => {
    const fit = mode === "fault" ? fitFaultPageLayout : fitReportPageLayout;
    // 쪽 번호를 넘긴다 — 고장 보고서는 첫 장과 이어지는 장의 격자 줄 수가 다르다
    pageRefs.current.forEach((el, i) => fit(el, i));
  });

  /** 원본의 [순서 이동] — 옮길 순번을 골라 그 자리로 끼워 넣는다 */
  function move(id: string, to: number) {
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === id);
      if (from === -1 || to < 0 || to >= prev.length || to === from) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addTextItem() {
    setItems((prev) => [...prev, { id: nextId(), kind: "text", body: "" }]);
  }

  /** 출력 전 공통 검사 — 통과하면 파일명(제목)을 준다 */
  function validateForOutput(): string | null {
    setError(null);
    setNotice(null);
    if (!fileName.trim()) {
      setError("파일명을 입력해 주세요.");
      return null;
    }
    if (items.length === 0) {
      setError("사진을 한 장 이상 추가해 주세요.");
      return null;
    }
    return fileName.trim();
  }

  /**
   * PDF 를 만들어 내려받고, 보관함에도 저장한다.
   * mailWindow 가 있으면(= [메일로 전송]) 다운로드가 끝난 뒤 그 탭을 Gmail 작성
   * 화면으로 돌린다. 창은 클릭 핸들러에서 *미리* 열어 두고 넘겨야 한다 —
   * await 뒤에 window.open 을 부르면 브라우저가 팝업으로 보고 막는다.
   */
  async function runExport(title: string, mailWindow: Window | null) {
    setBusy(true);
    // busy=true 가 되면 미리보기가 축소를 풀고 실제 크기로 돌아간다(아래 effectiveScale
    // 참고) — html2canvas 가 축소된 채로 캡처해 버리기 때문이다. setBusy 는 비동기라
    // 다음 두 번의 화면 그리기(rAF)를 기다려 그 변화가 실제로 반영된 뒤에 캡처를
    // 시작한다. 한 번만 기다리면 브라우저에 따라 아직 이전 프레임일 수 있다.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const pages = pageRefs.current.filter((el): el is HTMLDivElement => el !== null);

    try {
      // 다운로드가 우선이다 — 보관함 저장이 실패해도 사용자는 PDF 를 손에 넣어야 한다.
      await exportPagesToPdf(pages, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 출력에 실패했습니다.");
      mailWindow?.close();
      setBusy(false);
      return;
    }

    if (mailWindow) {
      mailWindow.location.href = gmailComposeUrl(title, mailBodyFor(`${title}.pdf`));
    }

    if (!archiveEnabled) {
      setNotice(
        mailWindow
          ? "PDF 를 내려받았습니다. 열린 Gmail 화면에서 첨부파일로 추가해 주세요."
          : "PDF 를 내려받았습니다. (보관함 미설정 — 저장은 건너뜀)",
      );
      setBusy(false);
      return;
    }

    /*
     * "수정 가능한 원본"(사진 + 모든 입력값)을 PDF 와 별개로 저장한다. 03
     * (supabase/docgen/03-docgen-sources.sql)을 아직 안 돌린 프로젝트에서는
     * 테이블이 없어 이 호출이 그냥 실패한다 — 조용히 넘긴다. PDF 보관은 03 과
     * 무관하게 그대로 되어야 하므로, 실패해도 사용자에게 경고를 띄우지 않고
     * link 없이(= 이 버전엔 [수정] 버튼이 안 뜨는 채로) 계속 진행한다.
     */
    let sourceLink: { lineageId: string; sourceId: string } | undefined;
    try {
      const saved = await saveDocumentSource({
        mode,
        fileName: title,
        title,
        author,
        meta: { ...(saveMetaRef.current ?? {}), ...(draftExtraRef.current ?? {}) },
        items,
        editingFrom: editingSource ?? undefined,
      });
      sourceLink = { lineageId: saved.lineageId, sourceId: saved.id };
      // 같은 자리에서 또 출력하면(예: PDF 출력 뒤 메일로 전송도 누르는 경우는
      // 없지만) 이어서 그 버전을 고치는 셈이 되도록 갱신해 둔다.
      setEditingSource({ id: saved.id, lineageId: saved.lineageId });
    } catch (e) {
      console.error("원본 저장 실패(03-docgen-sources.sql 미실행일 수 있음):", e);
    }

    try {
      const blob = await renderPagesToBlob(pages);
      const photoCount = items.filter((it) => !("kind" in it)).length;
      await saveToArchive(
        blob,
        {
          ...saveMeta,
          doc_type: mode,
          file_name: title,
          title,
          author_name: author.trim() || undefined,
          page_count: pages.length,
          photo_count: photoCount,
        },
        sourceLink,
      );
      setNotice(
        mailWindow
          ? "PDF 를 내려받고 보관함에도 저장했습니다. 열린 Gmail 화면에서 첨부파일로 추가해 주세요."
          : "PDF 를 내려받고 보관함에도 저장했습니다.",
      );
    } catch (e) {
      // 저장 실패를 조용히 넘기면 "저장된 줄 알았는데 없다"가 된다 — 반드시 알린다.
      const msg = e instanceof Error ? e.message : "보관함 저장에 실패했습니다.";
      setError(`PDF 는 내려받았지만 보관함 저장에 실패했습니다: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    const title = validateForOutput();
    if (title) void runExport(title, null);
  }

  /**
   * 메일로 전송 — PDF 다운로드와 Gmail 작성 화면 열기를 한 번에 (원본 generateMail).
   * 브라우저 보안상 외부 사이트가 Gmail 에 파일을 자동 첨부할 수는 없어서,
   * 받는 사람이 직접 첨부하도록 본문에 안내를 넣는다. (원본과 동일)
   */
  function handleMail() {
    const title = validateForOutput();
    if (!title) return;
    // PDF 를 만들기 전에(= 사용자 클릭과 같은 흐름에서) 빈 탭을 먼저 연다.
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(
        '<p style="font-family:sans-serif;padding:24px;color:#374151;">PDF를 준비하고 있습니다. 잠시만 기다려 주세요…</p>',
      );
    }
    void runExport(title, win);
  }

  // 고장 보고서의 "2. 관련 사진"은 사진 격자라 텍스트 칸을 놓을 자리가 없다.
  // 매뉴얼로 만들다 모드를 바꾼 경우를 대비해 사진만 골라 쪽을 나눈다. (원본 주석)
  /* 파일명·작성자 칸은 어느 배치에서든 같은 모양이라 여기서 한 번만 만든다.
     renderMeta 를 넘긴 모드는 이 둘을 받아 원하는 줄에 꽂는다. */
  const fileNameField = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="docFileName" className="text-xs font-bold text-on-surface-variant">
        파일명
      </label>
      <input
        id="docFileName"
        type="text"
        value={fileName}
        onChange={(e) => setFileName(e.target.value)}
        placeholder={MODE_PLACEHOLDERS[mode]}
        className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary md:rounded-sm md:bg-surface-container-low md:focus:bg-surface-container-lowest"
      />
    </div>
  );

  /* 로그인이 없으므로 작성자를 자동으로 알 수 없다. 보관함 목록에서 누가 만든
     문서인지 구분하려면 직접 적어야 한다(검증되지 않는 값). 보관함이 꺼져 있으면
     적어 둘 곳이 없으므로 칸 자체를 두지 않는다. */
  const authorField = archiveEnabled ? (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="docAuthor" className="text-xs font-bold text-on-surface-variant">
        작성자 <span className="font-normal">(보관함 표시용, 선택)</span>
      </label>
      <input
        id="docAuthor"
        type="text"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="이름을 입력하세요."
        className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary md:rounded-sm md:bg-surface-container-low md:focus:bg-surface-container-lowest"
      />
    </div>
  ) : null;

  const photos = items.filter((it): it is PhotoItem => !isTextItem(it));
  const pages: DocItem[][] = mode === "fault" ? chunkFaultPages(photos) : chunkPages(items);
  const title = fileName || label;
  // 출력(PDF 출력·메일로 전송) 중에는 1(실제 크기)로 되돌린다 — html2canvas 는
  // 조상의 transform 까지 반영해서 찍으므로, 줄인 채로 두면 PDF 가 작게 나온다.
  const effectiveScale = busy ? 1 : baseScale;

  return (
    <>
      <ScreenHeader
        icon="edit_note"
        title={`${MODE_TITLES[mode]} 작성`}
        desc={`사진을 추가하고 설명을 적으면 A4 규격 ${label} 문서를 자동으로 구성합니다. 최대 ${MAX_PHOTOS}장.`}
        // 모바일은 타이틀만 — 빈 배열이면 ScreenHeader가 desc·bullets 모두 생략한다
        bullets={[]}
        accent={accent}
        // 꽉 찬 칩 = 작성. 같은 챕터의 조회 화면은 같은 색 연한 칩이다
        tone="solid"
        action={headingAction}
      />

      {/* ---- 보관함에서 불러오는 중 ----
          ?edit= 으로 들어왔을 때만 뜬다. 사진을 Storage 에서 내려받는 동안이라
          장수에 따라 몇 초 걸릴 수 있다. */}
      {loadingSource && (
        <Card className="p-card-padding" lift={false}>
          <div className="flex items-center gap-3">
            <Icon name="cloud_download" className="text-primary text-2xl" />
            <p className="text-title-sm text-on-surface">
              보관함에서 불러오는 중입니다… 사진이 많으면 잠시 걸릴 수 있습니다.
            </p>
          </div>
        </Card>
      )}

      {/* ---- 이어서 작성 안내 ----
          조용히 되살리지 않고 물어본다 — 새로 쓰려던 사람이 예전 내용 위에
          덮어쓰는 일을 막아야 한다. (원본의 "이어서 작성하시겠습니까?" 대응) */}
      {draftMeta && (
        <Card className="p-card-padding" lift={false}>
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="history" className="text-primary text-2xl" />
            <div className="flex-1 min-w-48">
              <p className="text-title-sm text-on-surface">이어서 작성하시겠습니까?</p>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {formatSavedAt(draftMeta.savedAt)} 에 임시저장
                {draftMeta.fileName ? ` · ${draftMeta.fileName}` : ""} · 사진{" "}
                {draftMeta.photoCount}장
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void handleRestoreDraft()} disabled={draftBusy}>
                <Icon name="restore" className="text-lg" />
                이어서 작성
              </Button>
              <Button variant="ghost" onClick={() => void handleDiscardDraft()} disabled={draftBusy}>
                새로 시작
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/*
        작성(왼쪽) · 미리보기(오른쪽) 2열.
        입력칸 바로 옆에서 A4 쪽이 바뀌는 걸 보면서 쓰라는 요청으로 나눴다 — 전에는
        미리보기가 폼 맨 아래에 있어서, 위에서 적는 동안은 화면 밖으로 밀려 있었다.
        오른쪽은 스크롤해도 같은 자리에 붙어 있는다(xl:sticky) — 그래야 폼의 아래쪽
        칸(출력 버튼 등)까지 내려가도 미리보기가 계속 보인다("생중계").

        좁은 화면(xl 미만: 1280px)에서는 다시 세로로 쌓는다 — 미리보기 A4 쪽(210mm
        ≈ 794px)과 입력 폼을 억지로 나란히 욱여넣으면 둘 다 못 쓸 만큼 좁아진다.
      */}
      <div className="grid gap-gutter xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-gutter min-w-0">
          {/* ---- 머리말 ---- */}
          <Card className="p-card-padding">
            {renderMeta ? (
              renderMeta({ fileNameField, authorField })
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {fileNameField}
                {authorField}
                {metaFields}
              </div>
            )}
            {sections}
          </Card>

          {/* ---- 사진 추가 ----
              세 버튼(사진 추가·촬영·텍스트 칸 추가)은 같은 폭으로 나란히 두고,
              장수 안내는 그 아래 줄로 뺐다 — flex-wrap 으로 한 줄에 욱여넣으면 폰
              폭에서 버튼이 줄마다 다른 개수로 깨져 보였다. 아이콘을 글자 위로 올려
              세로로 쌓는 이유도 같다 — 좁은 칸에서 "텍스트 칸 추가" 같은 긴 이름이
              한 글자씩 꺾여 보이지 않게 한다. */}
          <Card className="p-card-padding">
            <div className="flex items-stretch gap-2">
              <Button
                className="flex-1 !flex-col !gap-1 !px-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={items.length >= MAX_PHOTOS}
              >
                <Icon name="add_photo_alternate" className="text-lg" />
                <span className="text-xs leading-tight">사진 추가</span>
              </Button>
              {/* 촬영은 폰에서만 의미가 있어 모바일 폭에서만 보인다 */}
              <Button
                variant="ghost"
                className="flex-1 !flex-col !gap-1 !px-1 md:hidden"
                onClick={() => cameraInputRef.current?.click()}
                disabled={items.length >= MAX_PHOTOS}
              >
                <Icon name="photo_camera" className="text-lg" />
                <span className="text-xs leading-tight">촬영</span>
              </Button>
              {allowTextItems && (
                <Button
                  variant="ghost"
                  className="flex-1 !flex-col !gap-1 !px-1"
                  onClick={addTextItem}
                >
                  <Icon name="text_fields" className="text-lg" />
                  <span className="text-xs leading-tight">텍스트 칸 추가</span>
                </Button>
              )}
            </div>
            <div className="mt-2 text-right">
              <span className="text-sm text-on-surface-variant">
                {items.length} / {MAX_PHOTOS}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {/* capture="environment" — 후면 카메라를 바로 연다. 촬영은 한 장씩이라
                  multiple 을 붙이지 않는다(붙이면 일부 기기에서 앨범으로 빠진다). */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {/* 사진 교체용 — 어느 칸을 바꿀지는 replaceTargetIdRef 가 들고 있다 */}
              <input
                ref={replaceFileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handleReplaceFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {error && (
              <p className="mt-3 text-sm font-bold text-status-error flex items-center gap-1.5">
                <Icon name="error" className="text-base" />
                {error}
              </p>
            )}

            {items.length === 0 ? (
              <EmptyState
                icon="photo_library"
                title="사진이 없습니다"
                desc={"[사진 추가]로 사진을 골라요.\n폰에서는 [촬영]으로 바로 찍어요."}
              />
            ) : (
              // 왼쪽 폭이 전체 화면보다 좁아질 수 있어(2열 미리보기 때문에) 3열까지는
              // 욱여넣지 않는다 — sm:grid-cols-2 가 폼 칸이 좁은 화면에서도 무난하다.
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {items.map((item, i) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-border-subtle bg-surface-container-high overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs font-bold text-on-surface-variant">
                        {i + 1}번{"kind" in item ? " · 텍스트" : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        {!("kind" in item) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingId(item.id)}
                              title="편집 (자르기·마킹)"
                              className="w-7 h-7 rounded-lg hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant"
                            >
                              <Icon name="edit" className="text-base" />
                            </button>
                            <button
                              type="button"
                              onClick={() => pickReplacement(item.id)}
                              title="사진 변경 (설명·순서는 그대로)"
                              className="w-7 h-7 rounded-lg hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant"
                            >
                              <Icon name="swap_horiz" className="text-base" />
                            </button>
                            <button
                              type="button"
                              onClick={() => rotate(item.id)}
                              title="90도 회전"
                              className="w-7 h-7 rounded-lg hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant"
                            >
                              <Icon name="rotate_right" className="text-base" />
                            </button>
                          </>
                        )}
                        <select
                          value={i}
                          onChange={(e) => move(item.id, Number(e.target.value))}
                          title="순서 이동"
                          className="h-7 rounded-lg bg-surface-container text-xs text-on-surface px-1.5 border border-border-subtle"
                        >
                          {items.map((_, n) => (
                            <option key={n} value={n}>
                              {n + 1}번으로
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          title="삭제"
                          className="w-7 h-7 rounded-lg hover:bg-status-error/10 flex items-center justify-center text-status-error"
                        >
                          <Icon name="delete" className="text-base" />
                        </button>
                      </div>
                    </div>

                    {"kind" in item ? (
                      <AutoTextarea
                        value={item.body}
                        onChange={(v) => updateText(item.id, v)}
                        minRows={3}
                        placeholder="칸 하나를 통째로 쓰는 텍스트입니다."
                        className="w-full px-3 py-2 bg-surface-container text-sm text-on-surface outline-none"
                      />
                    ) : (
                      <>
                        <div className="aspect-4/3 bg-surface-container flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                          <img
                            src={item.previewUrl ?? item.url}
                            alt=""
                            className="max-w-full max-h-full object-contain"
                            style={{
                              transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                            }}
                          />
                        </div>
                        <AutoTextarea
                          value={item.desc}
                          onChange={(v) => updateDesc(item.id, v)}
                          minRows={1}
                          placeholder="사진 설명"
                          className="w-full px-3 py-2 bg-surface-container text-sm text-on-surface outline-none"
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- 출력 ----
              세 버튼은 같은 폭으로 나란히, 글자는 한 줄 가로쓰기로 — 아이콘을
              빼서 생긴 자리를 글자에 그대로 준다. 아이콘이 있을 때는 gap 때문에
              좁은 칸에서 글자가 세로로 꺾여 보였다. */}
          <Card className="p-card-padding flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {/* 새로고침하면 작성 중이던 내용이 사라지므로, 잠깐 자리를 비울 때 눌러 둔다 */}
              <Button
                variant="ghost"
                className="w-full !px-1 whitespace-nowrap"
                onClick={() => void handleSaveDraft()}
                disabled={draftBusy || items.length === 0}
              >
                {draftBusy ? "저장 중…" : "임시저장"}
              </Button>
              <Button
                className="w-full !px-1 whitespace-nowrap"
                onClick={handleExport}
                disabled={busy || items.length === 0}
              >
                {/* 평소엔 "PDF 출력"과 길이가 비슷해야 버튼이 한 줄을 유지한다 —
                    "만들고 있습니다…"는 너무 길어 혼자만 줄바꿈되거나 넘쳤다 */}
                {busy ? "생성 중…" : "PDF 출력"}
              </Button>
              <Button
                variant="ghost"
                className="w-full !px-1 whitespace-nowrap"
                onClick={handleMail}
                disabled={busy || items.length === 0}
              >
                메일로 전송
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-on-surface-variant">
                A4 {pages.length}페이지 · 사진 {photos.length}장
              </span>
              {archiveEnabled ? (
                <span className="text-xs text-on-surface-variant ml-auto flex items-center gap-1">
                  <Icon name="cloud_done" className="text-sm" />
                  출력하면 보관함에도 저장됩니다
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant ml-auto flex items-center gap-1">
                  <Icon name="info" className="text-sm" />
                  보관함 미설정 — PDF 다운로드만 됩니다
                </span>
              )}
            </div>

            {notice && (
              <p className="text-sm font-bold text-status-success flex items-center gap-1.5">
                <Icon name="check_circle" className="text-base" />
                {notice}
              </p>
            )}
          </Card>
        </div>

        {/* ---- A4 미리보기 ----
            실제 출력과 같은 DOM 을 그대로 PDF 로 만든다. 칸 폭에 맞춰 통째로
            줄여서(scale) 쪽 전체가 한 번에 보이게 한다 — 좁은 칸(2열 작성 화면의
            오른쪽, 또는 폰 화면)에서 원래 크기(794px)로 두면 가로 스크롤을 해야만
            전체를 볼 수 있었다.

            html2canvas 는 조상의 transform 까지 반영해서 캡처해 버린다(= 줄어든
            채로 PDF 가 찍힌다). 그래서 출력(PDF 출력·메일로 전송) 중에는
            effectiveScale 을 1 로 되돌려 실제 크기로 캡처하고, 끝나면 다시 줄인다
            (runExport 의 busy 상태를 그대로 쓴다).

            xl 이상에서는 오른쪽 칸 전체를 sticky 로 고정한다 — 헤더(64px) 바로 아래
            붙어서, 왼쪽 폼을 아무리 내려도 미리보기가 같은 자리에 머문다. 안쪽
            스크롤 영역에는 화면 높이에 맞춘 세로 스크롤을 따로 준다 — 그러지 않으면
            쪽 수가 많을 때 미리보기 자체가 페이지 전체 스크롤을 끌고 가서
            sticky 가 무의미해진다.
        */}
        <section className="min-w-0 xl:sticky xl:top-[88px]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-headline-md text-on-surface">A4 미리보기</h2>
            {/* 확대/축소 — 100% 가 실제 크기(PDF 출력과 같은 잣대)다. 미리보기 위에서
                Ctrl+휠로도 같은 값을 조절할 수 있다. */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={zoomOut}
                disabled={baseScale <= ZOOM_MIN}
                aria-label="미리보기 축소"
                title="축소 (Ctrl+휠)"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-subtle bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="remove" className="text-base" />
              </button>
              <button
                type="button"
                onClick={zoomReset}
                title="눌러서 칸 폭에 맞추기"
                className="w-14 h-8 flex items-center justify-center rounded-lg border border-border-subtle bg-surface-container-lowest text-xs font-bold text-on-surface tabular-nums hover:bg-surface-container-high"
              >
                {Math.round(baseScale * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={baseScale >= ZOOM_MAX}
                aria-label="미리보기 확대"
                title="확대 (Ctrl+휠)"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-subtle bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="add" className="text-base" />
              </button>
            </div>
          </div>
          <div
            ref={previewContainerRef}
            className="overflow-auto rounded-2xl bg-surface-container-high p-4 xl:max-h-[calc(100vh-7rem)]"
          >
            <div className="flex flex-col gap-6 w-max">
              {pages.map((pageItems, pageIndex) => (
                <div
                  key={pageIndex}
                  className="shadow-lg"
                  // 줄어든 만큼 칸도 같이 줄인다 — transform 은 칠해지는 모양만 바꿀
                  // 뿐 차지하는 자리는 그대로라, 안 줄이면 밑에 빈 칸이 남는다.
                  style={{
                    width: A4_WIDTH_PX * effectiveScale,
                    height: A4_HEIGHT_PX * effectiveScale,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: A4_WIDTH_PX,
                      transform: effectiveScale === 1 ? undefined : `scale(${effectiveScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {mode === "fault" ? (
                      <FaultA4Page
                        ref={(el) => {
                          pageRefs.current[pageIndex] = el;
                        }}
                        title={title}
                        items={pageItems as PhotoItem[]}
                        pageIndex={pageIndex}
                        summary={faultSummary}
                      />
                    ) : (
                      <A4Page
                        ref={(el) => {
                          pageRefs.current[pageIndex] = el;
                        }}
                        // 매뉴얼은 표제부 표가 제목을 품으므로 가운데 큰 제목을 따로 두지 않는다
                        title={mode === "manual" ? undefined : title}
                        letterhead={
                          renderLetterhead
                            ? renderLetterhead(pageIndex + 1, pages.length, title)
                            : mode === "report"
                              ? <PageBanner />
                              : undefined
                        }
                        items={pageItems}
                        numbered={numbered}
                        startIndex={pageIndex * PHOTOS_PER_PAGE}
                        summary={pageIndex === 0 ? firstPageSummary : undefined}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {editingPhoto && (
        <PhotoEditorModal
          url={editingPhoto.url}
          width={editingPhoto.width}
          height={editingPhoto.height}
          rotation={editingPhoto.rotation}
          strokes={editingPhoto.strokes}
          onCancel={() => setEditingId(null)}
          onSave={(result) => handleEditSave(editingPhoto.id, result)}
        />
      )}
    </>
  );
}
