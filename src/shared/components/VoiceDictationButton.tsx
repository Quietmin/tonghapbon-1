"use client";

/**
 * 칸 하나짜리 음성 입력 버튼 — 누르면 녹음 시작, 다시 누르면 멈추고 그 구간을
 * OpenAI STT로 한 번에 받아쓴다. 결과는 onResult 로 한 번만 넘어온다(voiceRecording.ts
 * 참고 — 예전 브라우저 연속 인식의 중복 텍스트 문제를 "녹음 한 번 = 전사 한 번"으로
 * 없앴다). "버튼 하나 + 칸 하나"가 짝이다 — 사진 설명칸, 그리고 작성 화면(고장보고서·매뉴얼·현황)의
 * 글 입력칸마다 아래 WithVoiceInput 으로 붙는다(고르는 칸에는 두지 않는다).
 *
 * field 로 "어떤 칸을 채우는지"를 서버 정리 단계에 알려 준다(기본은 사진 설명 — 개조식·60자).
 * 따소미 대화창은 { label: "챗봇 질문", kind: "question" } 으로 붙여, 묻는 말투를 살린 채
 * 맥락에 맞게 잘못 들린 용어만 바로잡은 질문을 받는다.
 *
 * 결과를 받은 칸은 기존 글 뒤에 이어 붙이지 않고 새 글로 바꾼다(호출부 약속) — 받아쓴 글이
 * 마음에 들지 않아 다시 녹음하면, 새로 말한 내용이 그 자리에 들어가야 하기 때문이다.
 *
 * 마이크·녹음 API(MediaRecorder)를 지원하지 않으면 아무것도 그리지 않는다.
 */
import { useEffect, useState } from "react";
import { Icon } from "./ui";
import {
  isVoiceRecordingSupported,
  useAudioRecorder,
  transcribeAudio,
  type TranscribeFieldContext,
} from "@/shared/lib/voiceRecording";

export type VoiceDictationState = "idle" | "recording" | "processing";

// 사진 설명은 격자 안 좁은 칸에 들어가므로, 정리 단계에서 개조식으로 짧게
// 추려 달라고 미리 알려 둔다(그래도 길면 서버에서 한 번 더 잘라 준다).
const PHOTO_CAPTION: TranscribeFieldContext = { label: "사진 설명", kind: "long", maxChars: 60 };

export default function VoiceDictationButton({
  onResult,
  label = "음성 입력",
  className = "",
  field = PHOTO_CAPTION,
  onError,
  onStateChange,
  disabled = false,
}: {
  /** 녹음이 끝나고 전사·정리가 완료되면 그 글을 넘겨준다 — 칸에 어떻게 반영할지는 호출부가 정한다 */
  onResult: (text: string) => void;
  label?: string;
  className?: string;
  /** 채우는 칸의 맥락(서버 정리 단계에 전달). 기본은 사진 설명 */
  field?: TranscribeFieldContext;
  /** 주면 안내 문구를 버튼 옆에 그리지 않고 호출부에 넘긴다(null = 지움) — 좁은 입력줄에 붙일 때 */
  onError?: (message: string | null) => void;
  /** 녹음 중·변환 중 상태를 호출부에 알린다(입력칸 안내 문구 등) */
  onStateChange?: (state: VoiceDictationState) => void;
  disabled?: boolean;
}) {
  // 처음 그릴 때는 무조건 false 로 시작한다(서버는 window 가 없어 항상 false 를
  // 그린다 — 마운트 전에 바로 판단하면 하이드레이션 경고가 뜬다. 마운트 뒤
  // 이펙트에서 바꾸면 리액트가 안전하게 반영한다).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isVoiceRecordingSupported());
  }, []);
  const [processing, setProcessing] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const setError = (msg: string | null) => {
    setErrorState(msg);
    onError?.(msg);
  };

  useEffect(() => {
    return () => recorder.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onStateChange?.(recorder.isRecording ? "recording" : processing ? "processing" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.isRecording, processing]);

  async function toggle() {
    setError(null);
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setProcessing(true);
      const result = await transcribeAudio(blob, field);
      setProcessing(false);
      if (!result) {
        setError("음성을 텍스트로 바꾸지 못했어요. 다시 시도해 주세요.");
        return;
      }
      if (result.text) onResult(result.text);
      else setError("말씀을 알아듣지 못했어요. 다시 말씀해 주세요.");
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
        disabled={processing || (disabled && !recorder.isRecording)}
        aria-pressed={recorder.isRecording}
        aria-label={recorder.isRecording ? "녹음 중지" : processing ? "음성 변환 중" : label}
        title={recorder.isRecording ? "녹음 중지" : label}
        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${
          busy
            ? "bg-red-600 text-white animate-pulse"
            : "bg-red-500/15 text-red-600 hover:bg-red-500/25"
        } ${className}`}
      >
        <Icon name={recorder.isRecording ? "stop" : processing ? "hourglass_top" : "mic"} className="text-base" />
      </button>
      {error && !onError && <span className="text-xs text-status-error-text max-w-[180px]">{error}</span>}
    </span>
  );
}

/**
 * 입력칸 하나 + 그 칸 전용 음성 버튼 한 줄 — 작성 화면(고장보고서·매뉴얼·현황)의 글 입력칸마다 붙인다.
 * 사진 설명칸과 같은 배치(버튼이 칸 왼쪽)·같은 받아쓰기(field 로 칸 이름·종류를 서버 정리 단계에 알린다)를 쓴다.
 * 받아쓴 글은 onResult 로 넘기며 호출부는 칸 값을 그 글로 바꾼다(다시 녹음하면 새 글로 갈아 끼워진다).
 * 안내 문구(마이크 권한·인식 실패)는 버튼 옆이 아니라 줄 아래에 띄워 입력칸 폭을 줄이지 않는다.
 */
export function WithVoiceInput({
  field,
  onResult,
  disabled = false,
  multiline = false,
  children,
}: {
  field: TranscribeFieldContext;
  onResult: (text: string) => void;
  disabled?: boolean;
  /** 여러 줄 칸이면 버튼을 위쪽에 맞춘다 */
  multiline?: boolean;
  children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex gap-1.5 ${multiline ? "items-start" : "items-center"}`}>
        <VoiceDictationButton
          field={field}
          label={`${field.label} 음성 입력`}
          onResult={onResult}
          onError={setError}
          disabled={disabled}
          className={multiline ? "mt-1.5" : ""}
        />
        <div className="flex-1 min-w-0 [&>*]:w-full">{children}</div>
      </div>
      {error && <p className="text-xs text-status-error-text">{error}</p>}
    </div>
  );
}
