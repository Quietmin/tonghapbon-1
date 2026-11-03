"use client";

import { useEffect, useRef, useState } from "react";
import Dialog from "@/shared/components/Dialog";
import { Button, Icon, LoadingState } from "@/shared/components/ui";

/**
 * 보관함 [열기] — 전에는 서명 URL 을 새 탭으로 바로 열었는데(window.open), 폰
 * 브라우저에 따라 미리 보여주지 않고 곧장 다운로드 창부터 뜨는 경우가 있었다.
 * iframe + 브라우저 내장 PDF 뷰어로 바꿨더니 PC 크롬/엣지에서는 됐지만, 홈
 * 화면에 설치한 PWA(iOS WKWebView 등)는 내장 PDF 뷰어 자체가 없어서 iframe
 * 안이 그냥 빈 화면이 된다 — 네이티브 뷰어에 기대지 않고 pdf.js 로 직접
 * 페이지를 캔버스에 그려서 모든 환경에서 똑같이 보이게 한다.
 *
 * pdf.js 는 fetch 로 PDF 바이트를 직접 받아온다(이미지 태그나 iframe 네비게이션과
 * 달리 CORS 의 제약을 받는다) — Supabase Storage 서명 URL 은 access-control
 * -allow-origin: * 를 내려줘서 문제없다(확인됨).
 */

type PdfJsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsModule> | null = null;
function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // CDN을 쓰면 오프라인/사내망에서 깨질 수 있어 워커를 public/ 에 같이 배포해 둔다.
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

// 확대/축소 버튼의 배율 범위 — 100% = 칸 폭에 맞춘 기본 크기.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
// 예전 max-w-3xl(48rem) 과 같은 값 — 100%(기본 배율)일 때 보이던 크기를 그대로 유지한다.
const BASE_MAX_WIDTH = 768;
function clampZoom(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));
}

export default function PdfPreviewModal({
  title,
  previewUrl,
  downloadUrl,
  onClose,
}: {
  title: string;
  previewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docCacheRef = useRef<{ url: string; doc: any } | null>(null);
  const prevUrlRef = useRef(previewUrl);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    // 문서가 바뀌면(previewUrl) 배율도 기본값(칸 폭에 맞춤)으로 되돌린다 — 이전 문서에서
    // 확대해 둔 배율이 새 문서에도 그대로 남으면 혼란스럽다. 문서는 그대로인데 배율만
    // 바뀐 경우(줌 버튼)에는 이미 받아온 문서를 다시 받지 않고 캐시에서 꺼내 쓴다.
    const isNewDoc = prevUrlRef.current !== previewUrl || !docCacheRef.current;
    prevUrlRef.current = previewUrl;
    const zoomToUse = isNewDoc ? 1 : zoom;
    if (isNewDoc && zoom !== 1) setZoom(1);

    (async () => {
      try {
        setStatus("loading");
        const pdfjs = await loadPdfJs();
        let doc = docCacheRef.current?.doc;
        if (isNewDoc) {
          docCacheRef.current?.doc?.destroy?.();
          doc = await pdfjs.getDocument(previewUrl).promise;
          docCacheRef.current = { url: previewUrl, doc };
        }
        if (cancelled || !doc) return;

        const host = pagesRef.current;
        const container = scrollRef.current;
        if (!host || !container) return;
        host.replaceChildren();

        // 뷰포트 폭(+ 배율)에 맞춰 그리고, 고해상도 화면에서는 선명하도록 픽셀비를
        // 곱해서 캔버스 실제 해상도를 올린다. host 폭을 targetWidth 로 직접 지정해 두면
        // (box-sizing: border-box 라 패딩까지 포함한 값이다) 캔버스는 그 안에서 100%로
        // 꽉 차고, 배율 100% 를 넘으면 host 가 칸(container)보다 넓어져 가로 스크롤이 열린다.
        const targetWidth = Math.min(container.clientWidth || 800, BASE_MAX_WIDTH) * zoomToUse;
        host.style.width = `${Math.round(targetWidth)}px`;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await doc.getPage(pageNum);
          const unscaled = page.getViewport({ scale: 1 });
          const cssScale = targetWidth / unscaled.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.className = "rounded shadow-sm bg-white";
          host.appendChild(canvas);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("PDF 미리보기 렌더 실패", e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl, zoom]);

  // 창을 닫을 때(언마운트) 캐시해 둔 문서를 정리한다.
  useEffect(() => {
    return () => {
      docCacheRef.current?.doc?.destroy?.();
      docCacheRef.current = null;
    };
  }, []);

  // 문서를 보는 창이라 화면을 최대한 쓴다(viewer). 틀(포털·Esc·스크롤 잠금·포커스)은 공통 Dialog.
  return (
    <Dialog
      onClose={onClose}
      label={`${title} 미리보기`}
      size="viewer"
      sheet={false}
      className="flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 p-3 border-b border-border-subtle shrink-0">
        <p className="flex-1 min-w-0 text-sm font-bold text-on-surface truncate">{title}</p>
        {/* 확대/축소 — 두 손가락 핀치 줌(아래 스크롤 칸의 touch-action 참고)은 iOS에서
            홈 화면에 설치한 PWA(standalone)일 때 OS 자체가 막아 버리는 경우가 있어
            믿을 수 없다. 버튼은 그런 환경과 무관하게 항상 되므로 폰에서도 보여 준다. */}
        <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="PDF 확대·축소">
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            disabled={status !== "ready" || zoom <= ZOOM_MIN}
            aria-label="축소"
            title="축소"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="remove" className="text-base" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            disabled={status !== "ready"}
            title="눌러서 100%로"
            className="min-w-[3.25rem] h-9 px-1 rounded-lg text-xs font-bold text-on-surface-variant tabular-nums hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            disabled={status !== "ready" || zoom >= ZOOM_MAX}
            aria-label="확대"
            title="확대"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="add" className="text-base" />
          </button>
        </div>
        <a href={downloadUrl} className="shrink-0">
          <Button variant="ghost" className="h-9 px-2 sm:px-3 text-xs">
            <Icon name="download" className="text-base" />
            <span className="hidden sm:inline">다운로드</span>
          </Button>
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>

      {/*
        배율 100%(기본)일 때는 overflow-x 를 hidden 으로 막아 둔다 — overflow-y 만
        auto 로 주면 브라우저가 "둘 중 하나가 visible 이 아니면 나머지도 auto 로
        본다"는 규칙 때문에 캔버스 폭이 반올림 등으로 컨테이너보다 1px 만 넘어도
        좌우로 밀리는 "흔들림"이 생긴다. 100%를 넘겨 확대한 동안에는(줌 버튼) 캔버스가
        실제로 칸보다 넓어지므로 그때는 auto 로 바꿔 가로 스크롤을 열어 준다.
        터치는 세로 스크롤(pan-y)과 두 손가락 확대(pinch-zoom)만 허용하고 한 손가락
        좌우 스와이프만 막는다 — pan-y 만 쓰면 핀치 줌 자체가 막혀 폰에서 PDF를
        확대해 볼 수 없었다.
      */}
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto bg-surface-container ${zoom > 1 ? "overflow-x-auto" : "overflow-x-hidden"}`}
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        {status === "loading" && (
          <LoadingState label="PDF 불러오는 중…" rows={3} />
        )}
        {status === "error" && (
          <div className="py-10 text-center text-sm text-on-surface-variant px-4">
            <p className="mb-3">미리보기를 불러오지 못했습니다.</p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener"
              className="text-primary font-bold hover:underline inline-flex items-center gap-1"
            >
              <Icon name="open_in_new" className="text-sm" />
              새 탭에서 열기
            </a>
          </div>
        )}
        {/* 폭은 Tailwind 클래스로 묶지 않는다 — 렌더 이펙트가 배율에 맞춰 style.width 를
            직접 지정한다(위 effect 참고). max-w 클래스를 두면 확대했을 때 그 안에서
            다시 줄어 보인다. */}
        <div ref={pagesRef} className="flex flex-col items-center gap-2 p-2 sm:p-4 mx-auto" />
      </div>
    </Dialog>
  );
}
