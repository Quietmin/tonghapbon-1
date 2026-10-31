"use client";

import { useEffect, useRef, useState } from "react";
import Dialog from "@/shared/components/Dialog";
import { Button, Icon } from "@/shared/components/ui";

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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let doc: any = null;

    (async () => {
      try {
        setStatus("loading");
        const pdfjs = await loadPdfJs();
        doc = await pdfjs.getDocument(previewUrl).promise;
        if (cancelled) return;

        const host = pagesRef.current;
        if (!host) return;
        host.replaceChildren();

        // 뷰포트 폭에 맞춰 1배로 그리고, 고해상도 화면에서는 선명하도록 픽셀비를
        // 곱해서 캔버스 실제 해상도를 올린다(화면 표시 크기는 CSS 로 100%만 유지).
        const targetWidth = Math.min(host.clientWidth || 800, 900);
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
      doc?.destroy?.();
    };
  }, [previewUrl]);

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
        <a href={downloadUrl} className="shrink-0">
          <Button variant="ghost" className="h-9 px-3 text-xs">
            <Icon name="download" className="text-base" />
            다운로드
          </Button>
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>

      {/*
        overflow-y 만 auto 로 주면 overflow-x 는 기본값(visible)인데, 브라우저는
        "둘 중 하나가 visible 이 아니면 나머지도 auto 로 본다"는 규칙이 있어
        overflow-x 도 조용히 스크롤 가능해진다 — 캔버스 폭이 반올림 등으로
        컨테이너보다 1px 만 넘어도 좌우로 밀리는 "흔들림"이 생긴다. 명시적으로
        hidden 을 줘서 세로로만 고정한다(터치 패닝도 pan-y 로 한 번 더 막는다).
      */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface-container"
        style={{ touchAction: "pan-y" }}
      >
        {status === "loading" && (
          <p className="py-10 text-center text-sm text-on-surface-variant">PDF 불러오는 중…</p>
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
        <div ref={pagesRef} className="flex flex-col items-center gap-2 p-2 sm:p-4 max-w-3xl mx-auto" />
      </div>
    </Dialog>
  );
}
