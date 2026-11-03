"use client";

/**
 * 음성 입력 — 녹음 + 서버 전사(STT). 예전에는 브라우저 내장 Web Speech API를 연속
 * 인식 모드로 돌렸는데, 그 엔진이 말을 끊을 때마다 "확정된 결과"를 내놓다가 네트워크
 * 지연 등으로 같은 구간을 다시 확정해 중복 텍스트를 쏟아내는 문제가 있었다(사용자가
 * 실제로 겪은 버그). 그래서 "녹음 한 번(시작~정지) = 서버 전사 한 번"으로 단순화했다
 * — 중복이 생길 자리 자체가 없다. 전사는 OpenAI STT(+ 칸 맥락에 맞춘 GPT 정리 한 번
 * 더)를 쓴다(api/voice/transcribe, 오버홀 챗봇과 같은 OPENAI_API_KEY 를 쓴다).
 */
import { useCallback, useRef, useState } from "react";

export function isVoiceRecordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(navigator.mediaDevices && window.MediaRecorder);
}

export interface AudioRecorder {
  isRecording: boolean;
  /** 마이크 권한을 받아 녹음을 시작한다. 권한 거부 등으로 실패하면 false. */
  start: () => Promise<boolean>;
  /** 녹음을 멈추고 오디오 Blob 을 돌려준다(녹음 중이 아니었으면 null). */
  stop: () => Promise<Blob | null>;
  /** 결과를 버리고 그냥 끈다(언마운트 등) */
  cancel: () => void;
}

/** 녹음 하나(시작~정지)를 오디오 Blob 으로 돌려주는 훅 — 전사 호출은 호출부가 한다 */
export function useAudioRecorder(): AudioRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(t) : false,
      );
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        resolve?.(blob.size > 0 ? blob : null);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    setIsRecording(false);
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    setIsRecording(false);
    stopResolveRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  return { isRecording, start, stop, cancel };
}

export interface TranscribeFieldContext {
  label: string;
  kind: "short" | "long";
  options?: readonly string[];
  /** 자리가 좁은 칸(예: 사진 설명)이면 대략 이 글자 수를 넘지 않게 짧게 정리해 달라고 알려 준다 */
  maxChars?: number;
}

export interface TranscribeResult {
  /** OpenAI STT가 그대로 받아쓴 원문 */
  raw: string;
  /** 칸 맥락에 맞게 GPT가 한 번 더 정리한(칸 이름 언급 제거·군더더기 제거) 값 */
  text: string;
}

/** 녹음한 오디오를 서버(api/voice/transcribe)로 보내 텍스트로 받는다. 실패하면 null
 *  — 호출부가 "다시 말씀해 주세요" 같은 안내로 대체한다. */
export async function transcribeAudio(
  blob: Blob,
  field: TranscribeFieldContext,
): Promise<TranscribeResult | null> {
  try {
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("fieldLabel", field.label);
    form.append("fieldKind", field.kind);
    if (field.options?.length) form.append("options", JSON.stringify(field.options));
    if (field.maxChars) form.append("maxChars", String(field.maxChars));
    const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return { raw: typeof data.raw === "string" ? data.raw : "", text: typeof data.text === "string" ? data.text : "" };
  } catch {
    return null;
  }
}
