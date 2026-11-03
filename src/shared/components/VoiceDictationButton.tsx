"use client";

/**
 * 칸 하나짜리 음성 입력 버튼 — 누르면 녹음 시작, 다시 누르면 멈추고 그 구간을
 * OpenAI STT로 한 번에 받아쓴다. 결과는 onResult 로 한 번만 넘어온다(voiceRecording.ts
 * 참고 — 예전 브라우저 연속 인식의 중복 텍스트 문제를 "녹음 한 번 = 전사 한 번"으로
 * 없앴다). 사진 설명칸처럼 "버튼 하나 + 칸 하나"가 짝인 곳에 붙인다 — 여러 칸을
 * 순서대로 도는 매뉴얼 작성 쪽 받아쓰기는 VoiceSequenceFill.tsx 를 따로 쓴다.
 *
 * 마이크·녹음 API(MediaRecorder)를 지원하지 않으면 아무것도 그리지 않는다.
 */
import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { isVoiceRecordingSupported, useAudioRecorder, transcribeAudio } from "@/shared/lib/voiceRecording";

export default function VoiceDictationButton({
  onResult,
  label = "음성 입력",
  className = "",
}: {
  /** 녹음이 끝나고 전사·정리가 완료되면 그 글을 넘겨준다 — 칸에 어떻게 반영할지는 호출부가 정한다 */
  onResult: (text: string) => void;
  label?: string;
  className?: string;
}) {
  // 처음 그릴 때는 무조건 false 로 시작한다(서버는 window 가 없어 항상 false 를
  // 그린다 — 마운트 전에 바로 판단하면 하이드레이션 경고가 뜬다. 마운트 뒤
  // 이펙트에서 바꾸면 리액트가 안전하게 반영한다).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isVoiceRecordingSupported());
  }, []);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  useEffect(() => {
    return () => recorder.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    setError(null);
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setProcessing(true);
      const result = await transcribeAudio(blob, { label: "사진 설명", kind: "long" });
      setProcessing(false);
      if (!result) {
        setError("음성을 텍스트로 바꾸지 못했어요. 다시 시도해 주세요.");
        return;
      }
      if (result.text) onResult(result.text);
      return;
    }
    const ok = await recorder.start();
    if (!ok) setError("마이크 권한이 꺼져 있어요. 브라우저 주소창 옆 자물쇠 아이콘에서 허용해 주세요.");
  }

  if (!supported) return null;

  const busy = recorder.isRecording || processing;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={processing}
        aria-pressed={recorder.isRecording}
        title={recorder.isRecording ? "녹음 중지" : label}
        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${
          busy
            ? "bg-red-600 text-white animate-pulse"
            : "bg-red-500/15 text-red-600 hover:bg-red-500/25"
        } ${className}`}
      >
        <Icon name={recorder.isRecording ? "stop" : processing ? "hourglass_top" : "mic"} className="text-base" />
      </button>
      {error && <span className="text-xs text-status-error-text max-w-[180px]">{error}</span>}
    </span>
  );
}
