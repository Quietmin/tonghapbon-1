"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon } from "@/shared/components/ui";
import {
  MAX_PHOTOS,
  MODE_LABELS,
  MODE_PLACEHOLDERS,
  PHOTOS_PER_PAGE,
  type DocMode,
} from "../lib/constants";
import { isDocgenSupabaseConfigured } from "../lib/supabase";
import { saveToArchive, type SaveMeta } from "../lib/archive";
import { isTextItem, type DocItem, type PhotoItem } from "../lib/types";
import { exportPagesToPdf, renderPagesToBlob } from "../lib/pdf";
import { A4Page, FaultA4Page, chunkFaultPages, chunkPages } from "./A4Preview";
import { PageBanner } from "./Letterhead";

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
  /** 매뉴얼 모드에서 텍스트 전용 칸 추가를 허용할지 */
  allowTextItems?: boolean;
  /**
   * 보관함에 함께 저장할 모드별 메타.
   * 호출부(각 모드 page.tsx)가 자기 입력값을 documents 컬럼명으로 넘겨준다.
   */
  saveMeta?: Omit<SaveMeta, "doc_type" | "file_name" | "title" | "page_count" | "photo_count">;
}

export default function DocEditor({
  mode,
  metaFields,
  numbered = false,
  renderLetterhead,
  faultSummary,
  allowTextItems = false,
  saveMeta,
}: DocEditorProps) {
  const [fileName, setFileName] = useState("");
  const [author, setAuthor] = useState("");
  const [items, setItems] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const archiveEnabled = isDocgenSupabaseConfigured();
  const label = MODE_LABELS[mode];

  // object URL 은 브라우저가 자동으로 놓아주지 않는다 — 화면을 떠날 때 직접 해제한다.
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (!("kind" in it)) URL.revokeObjectURL(it.url);
      });
    };
    // 언마운트 시 1회만 — items 를 의존성에 넣으면 편집 중에 URL 이 회수된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      const photos = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (photos.length === 0) {
        setError("이미지 파일만 추가할 수 있습니다.");
        return;
      }

      setItems((prev) => {
        const room = MAX_PHOTOS - prev.length;
        if (room <= 0) {
          setError(`사진은 최대 ${MAX_PHOTOS}장까지 넣을 수 있습니다.`);
          return prev;
        }
        if (photos.length > room) {
          setError(`최대 ${MAX_PHOTOS}장까지만 들어갑니다. ${room}장만 추가했습니다.`);
        }
        const added: PhotoItem[] = photos.slice(0, room).map((file) => ({
          id: nextId(),
          file,
          url: URL.createObjectURL(file),
          desc: "",
          rotation: 0,
        }));
        return [...prev, ...added];
      });
    },
    [],
  );

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
      if (target && !("kind" in target)) URL.revokeObjectURL(target.url);
      return prev.filter((it) => it.id !== id);
    });
  }

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

  async function handleExport() {
    setError(null);
    setNotice(null);
    if (!fileName.trim()) {
      setError("파일명을 입력해 주세요.");
      return;
    }
    if (items.length === 0) {
      setError("사진을 한 장 이상 추가해 주세요.");
      return;
    }

    setBusy(true);
    const pages = pageRefs.current.filter((el): el is HTMLDivElement => el !== null);
    const title = fileName.trim();

    try {
      // 다운로드가 우선이다 — 보관함 저장이 실패해도 사용자는 PDF 를 손에 넣어야 한다.
      await exportPagesToPdf(pages, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 출력에 실패했습니다.");
      setBusy(false);
      return;
    }

    if (!archiveEnabled) {
      setNotice("PDF 를 내려받았습니다. (보관함 미설정 — 저장은 건너뜀)");
      setBusy(false);
      return;
    }

    try {
      const blob = await renderPagesToBlob(pages);
      const photoCount = items.filter((it) => !("kind" in it)).length;
      await saveToArchive(blob, {
        ...saveMeta,
        doc_type: mode,
        file_name: title,
        title,
        author_name: author.trim() || undefined,
        page_count: pages.length,
        photo_count: photoCount,
      });
      setNotice("PDF 를 내려받고 보관함에도 저장했습니다.");
    } catch (e) {
      // 저장 실패를 조용히 넘기면 "저장된 줄 알았는데 없다"가 된다 — 반드시 알린다.
      const msg = e instanceof Error ? e.message : "보관함 저장에 실패했습니다.";
      setError(`PDF 는 내려받았지만 보관함 저장에 실패했습니다: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // 고장 보고서의 "2. 관련 사진"은 사진 격자라 텍스트 칸을 놓을 자리가 없다.
  // 매뉴얼로 만들다 모드를 바꾼 경우를 대비해 사진만 골라 쪽을 나눈다. (원본 주석)
  const photos = items.filter((it): it is PhotoItem => !isTextItem(it));
  const pages: DocItem[][] = mode === "fault" ? chunkFaultPages(photos) : chunkPages(items);
  const title = fileName || label;

  return (
    <>
      <section className="pt-2">
        <h1 className="text-display-lg text-on-surface">{label} 만들기</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          사진을 추가하고 설명을 적으면 A4 규격 {label} 문서를 자동으로 구성합니다. 최대{" "}
          {MAX_PHOTOS}장.
        </p>
      </section>

      {/* ---- 머리말 ---- */}
      <Card className="p-card-padding">
        <div className="grid gap-4 md:grid-cols-2">
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
              className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
            />
          </div>
          {/* 로그인이 없으므로 작성자를 자동으로 알 수 없다. 보관함 목록에서
              누가 만든 문서인지 구분하려면 직접 적어야 한다(검증되지 않는 값). */}
          {archiveEnabled && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="docAuthor" className="text-xs font-bold text-on-surface-variant">
                작성자 <span className="font-normal">(보관함 표시용, 선택)</span>
              </label>
              <input
                id="docAuthor"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="예: 김영섭"
                className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
              />
            </div>
          )}
          {metaFields}
        </div>
      </Card>

      {/* ---- 사진 추가 ---- */}
      <Card className="p-card-padding">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileInputRef.current?.click()} disabled={items.length >= MAX_PHOTOS}>
            <Icon name="add_photo_alternate" className="text-lg" />
            사진 추가
          </Button>
          {allowTextItems && (
            <Button variant="ghost" onClick={addTextItem}>
              <Icon name="text_fields" className="text-lg" />
              텍스트 칸 추가
            </Button>
          )}
          <span className="text-sm text-on-surface-variant ml-auto">
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
            desc={`[사진 추가]로 앨범에서 사진을 고르세요. 한 번에 여러 장 선택할 수 있습니다.`}
          />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      <button
                        type="button"
                        onClick={() => rotate(item.id)}
                        title="90도 회전"
                        className="w-7 h-7 rounded-lg hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant"
                      >
                        <Icon name="rotate_right" className="text-base" />
                      </button>
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
                  <textarea
                    value={item.body}
                    onChange={(e) => updateText(item.id, e.target.value)}
                    rows={5}
                    placeholder="칸 하나를 통째로 쓰는 텍스트입니다."
                    className="w-full px-3 py-2 bg-surface-container text-sm text-on-surface outline-none resize-y"
                  />
                ) : (
                  <>
                    <div className="aspect-4/3 bg-surface-container flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                      <img
                        src={item.url}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                        style={{
                          transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                        }}
                      />
                    </div>
                    <textarea
                      value={item.desc}
                      onChange={(e) => updateDesc(item.id, e.target.value)}
                      rows={2}
                      placeholder="사진 설명"
                      className="w-full px-3 py-2 bg-surface-container text-sm text-on-surface outline-none resize-y"
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- 출력 ---- */}
      <Card className="p-card-padding flex flex-wrap items-center gap-2">
        <Button onClick={handleExport} disabled={busy || items.length === 0}>
          <Icon name="picture_as_pdf" className="text-lg" />
          {busy ? "만들고 있습니다…" : "PDF 출력"}
        </Button>
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
        {notice && (
          <p className="w-full text-sm font-bold text-status-success flex items-center gap-1.5">
            <Icon name="check_circle" className="text-base" />
            {notice}
          </p>
        )}
      </Card>

      {/* ---- A4 미리보기 ----
          실제 출력과 같은 DOM 을 그대로 PDF 로 만든다. 화면에서는 좁은 창에 맞게
          가로 스크롤로 보여주되, 축소(transform)는 걸지 않는다 —
          html2canvas 가 축소된 상태를 그대로 캡처해 버리기 때문이다. */}
      <section>
        <h2 className="text-headline-md text-on-surface mb-3">A4 미리보기</h2>
        <div className="overflow-x-auto rounded-2xl bg-surface-container-high p-4">
          <div className="flex flex-col gap-6 w-max">
            {pages.map((pageItems, pageIndex) => (
              <div key={pageIndex} className="shadow-lg">
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
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
