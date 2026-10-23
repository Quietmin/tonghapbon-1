"use client";

import { Button, Icon } from "@/shared/components/ui";

/**
 * 보관함 [열기] — 전에는 서명 URL 을 새 탭으로 바로 열었는데(window.open), 폰
 * 브라우저에 따라 미리 보여주지 않고 곧장 다운로드 창부터 뜨는 경우가 있었다.
 * 그 대신 앱 안에서 iframe 으로 미리 보여주고, 받고 싶으면 따로 [다운로드]를
 * 누르게 한다 — 요청하신 "미리보기 먼저, 다운로드는 그다음" 그대로다.
 *
 * previewUrl 은 Content-Disposition: inline 서명 URL(브라우저 내장 PDF 뷰어로
 * 열림), downloadUrl 은 download:true 로 다시 받은 서명 URL(곧장 저장 창이
 * 뜬다) — archive.ts 의 getSignedUrl 주석 참고. 같은 파일이지만 서버가 다르게
 * 응답하도록 URL 자체가 다르다.
 */
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
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-2 sm:p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 미리보기`}
      onClick={onClose}
    >
      <div
        // 문서를 보는 화면이라 화면을 최대한 쓴다 — 작은 중앙 팝업이면 PDF 가 더 작게 보인다.
        className="w-full h-full max-w-5xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] bg-surface-container-lowest rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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

        {/* 일부 브라우저·보안 설정은 iframe 안에서 PDF 를 못 그릴 수 있다 — 그때를
            대비해 "새 탭에서 열기"를 늘 함께 보여 준다(숨겨 둔 비상구가 아니라
            눈에 보이는 대안이어야 실제로 쓰인다). */}
        <div className="px-3 py-1.5 border-b border-border-subtle shrink-0">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener"
            className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
          >
            <Icon name="open_in_new" className="text-sm" />
            여기서 안 보이면 새 탭에서 열기
          </a>
        </div>

        <iframe src={previewUrl} title={title} className="flex-1 min-h-0 w-full bg-surface-container" />
      </div>
    </div>
  );
}
