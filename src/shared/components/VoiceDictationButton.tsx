"use client";

/**
 * 칸 하나짜리 음성 입력 버튼 — 누르면 듣기 시작, 다시 누르면 멈춘다. 말한 내용은
 * onResult 로 그때그때(말을 끊을 때마다) 넘어온다. 사진 설명칸처럼 "버튼 하나 +
 * 칸 하나"가 짝인 곳에 붙인다 — 여러 칸을 순서대로 도는 매뉴얼 작성 쪽 받아쓰기는
 * voiceSequenceFill.tsx 를 따로 쓴다(이 버튼보다 훨씬 더 하는 일이 많다).
 *
 * 브라우저가 지원하지 않으면(Safari·Firefox 등) 아무것도 그리지 않는다 — 안 되는
 * 버튼을 보여주고 눌러보게 하는 것보다, 그 자리에 아예 없는 쪽이 덜 헷갈린다.
 */
import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { useSpeechDictation, isSpeechDictationSupported } from "@/shared/lib/speechDictation";

export default function VoiceDictationButton({
  onResult,
  label = "음성 입력",
  className = "",
}: {
  /** 말을 끊을 때마다(브라우저가 확정한 구간) 그 글을 넘겨준다 — 칸에 어떻게 반영할지는 호출부가 정한다 */
  onResult: (text: string) => void;
  label?: string;
  className?: string;
}) {
  // 처음 그릴 때는 무조건 false 로 시작한다(서버는 window 가 없어 항상 false 를
  // 그린다 — 여기서 마운트 전에 isSpeechDictationSupported() 로 바로 판단해 버리면
  // 지원하는 브라우저(크롬 등)에서는 서버 그림(없음)과 클라이언트 그림(버튼 있음)이
  // 달라져 모든 실제 사용자에게 하이드레이션 경고가 뜬다. 마운트 뒤 이펙트에서
  // 바꾸면 리액트가 "이 바뀜은 그 뒤에 생긴 거다"로 알고 안전하게 반영한다.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isSpeechDictationSupported());
  }, []);
  const [error, setError] = useState<string | null>(null);

  const dictation = useSpeechDictation({
    onFinalResult: onResult,
    onError: (e) => {
      if (e === "not-allowed" || e === "service-not-allowed") {
        setError("마이크 권한이 꺼져 있어요. 브라우저 주소창 옆 자물쇠 아이콘에서 허용해 주세요.");
      } else {
        setError("음성 인식 중 문제가 생겼어요. 다시 눌러 주세요.");
      }
    },
  });

  if (!supported) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          if (dictation.isListening) {
            dictation.stop();
            return;
          }
          setError(null);
          dictation.start();
        }}
        aria-pressed={dictation.isListening}
        title={dictation.isListening ? "음성 입력 중지" : label}
        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          dictation.isListening
            ? "bg-status-error text-on-primary animate-pulse"
            : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
        } ${className}`}
      >
        <Icon name={dictation.isListening ? "stop" : "mic"} className="text-base" />
      </button>
      {error && (
        <span className="text-xs text-status-error-text max-w-[180px]">{error}</span>
      )}
    </span>
  );
}
